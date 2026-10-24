import { db } from '../../core/database/db';
import { NotFoundError } from '../../core/errors/rfc9457';

export interface SchemeRuleDSL {
  minAge?: number;
  maxAge?: number;
  gender?: string[];
  allowedIncomeCategories?: string[]; // ['BPL', 'APL']
  maxAnnualIncome?: number;
  allowedDistricts?: string[];
  requiredDocuments?: string[];
  oncePerGrantUnit?: boolean;
  cooldownDays?: number;
  mutualExclusions?: string[]; // Scheme codes that cannot be active simultaneously
  prerequisiteSchemes?: string[]; // Schemes that must have been previously received
}

export interface EligibilityResult {
  eligible: boolean;
  schemeId: string;
  schemeCode: string;
  grantUnit: 'INDIVIDUAL' | 'HOUSEHOLD' | 'PROPERTY';
  passedRules: string[];
  failedRules: string[];
  reasons: string[];
  evidence: Record<string, any>;
}

export class RulesEngineService {
  // Evaluate eligibility against versioned rules DSL
  evaluateEligibility(params: {
    schemeCode: string;
    applicantPersonUid?: string;
    householdUid?: string;
    propertyUid?: string;
    versionNumber?: number;
    guestProfile?: {
      age?: number;
      gender?: string;
      incomeCategory?: string;
      district?: string;
      hasToilet?: boolean;
      priorBenefitReceived?: boolean;
      hasExistingBenefit?: boolean;
    };
  }): EligibilityResult {
    const schemes = db.getTable('schemes');
    const scheme = schemes.find((s) => s.code === params.schemeCode && s.active);
    if (!scheme) throw new NotFoundError(`Scheme not found: ${params.schemeCode}`);

    const versions = db.getTable('scheme_versions');
    let version = versions.find((v) => v.scheme_id === scheme.id && v.is_active);
    if (params.versionNumber) {
      version = versions.find((v) => v.scheme_id === scheme.id && v.version_number === params.versionNumber);
    }
    if (!version) throw new NotFoundError(`Scheme version not found for: ${params.schemeCode}`);

    const rules: SchemeRuleDSL = version.rules_dsl || {};
    const persons = db.getTable('persons');
    const memberships = db.getTable('household_memberships');
    let person = params.applicantPersonUid ? persons.find((p) => p.person_uid === params.applicantPersonUid && p.is_current) : null;
    let household: any = null;
    let householdUid = params.householdUid;
    let propertyUid = params.propertyUid;

    if (!person && (params.guestProfile || !params.applicantPersonUid)) {
      const g = params.guestProfile || {};
      const birthYear = new Date().getFullYear() - (g.age || 35);
      person = {
        person_uid: 'GUEST-CITIZEN',
        full_name: 'Guest Applicant',
        date_of_birth: `${birthYear}-01-15`,
        gender: (g.gender || 'MALE').toUpperCase(),
        district: (g.district || 'CENTRAL').toUpperCase(),
        is_current: true,
      } as any;
      household = {
        household_uid: 'GUEST-HH',
        property_uid: 'GUEST-PROP',
        income_category: (g.incomeCategory || 'BPL').toUpperCase(),
        is_current: true,
      };
      householdUid = 'GUEST-HH';
      propertyUid = 'GUEST-PROP';
    } else if (!person) {
      throw new NotFoundError(`Person not found: ${params.applicantPersonUid}`);
    } else {
      // Fetch household and property details
      const member = memberships.find((m) => m.person_uid === params.applicantPersonUid && m.is_current);
      householdUid = params.householdUid || member?.household_uid;

      const households = db.getTable('households');
      household = householdUid ? households.find((h) => h.household_uid === householdUid && h.is_current) : null;
      propertyUid = params.propertyUid || household?.property_uid;
    }

    if (!person) throw new NotFoundError(`Person not found: ${params.applicantPersonUid}`);

    const ledger = db.getTable('benefit_ledger');

    const passedRules: string[] = [];
    const failedRules: string[] = [];
    const reasons: string[] = [];
    const evidence: Record<string, any> = {
      applicantAge: this.calculateAge(person.date_of_birth),
      gender: person.gender,
      district: person.district,
      incomeCategory: household?.income_category || 'APL',
      grantUnit: scheme.grant_unit,
    };

    // 1. Age check
    const age = this.calculateAge(person.date_of_birth);
    if (rules.minAge !== undefined) {
      if (age >= rules.minAge) {
        passedRules.push(`Min age requirement (>= ${rules.minAge}) met: applicant is ${age}`);
      } else {
        failedRules.push(`Applicant age (${age}) is below minimum required (${rules.minAge})`);
        reasons.push(`You must be at least ${rules.minAge} years old (current age: ${age}).`);
      }
    }

    if (rules.maxAge !== undefined) {
      if (age <= rules.maxAge) {
        passedRules.push(`Max age requirement (<= ${rules.maxAge}) met: applicant is ${age}`);
      } else {
        failedRules.push(`Applicant age (${age}) exceeds maximum allowed (${rules.maxAge})`);
        reasons.push(`Applicant age exceeds the upper limit of ${rules.maxAge} years.`);
      }
    }

    // 2. Gender check
    if (rules.gender && rules.gender.length > 0) {
      if (rules.gender.includes(person.gender.toUpperCase())) {
        passedRules.push(`Gender criteria met: ${person.gender}`);
      } else {
        failedRules.push(`Gender requirement not satisfied: expected [${rules.gender.join(', ')}], got ${person.gender}`);
        reasons.push(`Scheme is exclusively designated for: ${rules.gender.join(', ')}`);
      }
    }

    // 3. Income category check
    if (rules.allowedIncomeCategories && rules.allowedIncomeCategories.length > 0) {
      const cat = household?.income_category || 'APL';
      if (rules.allowedIncomeCategories.includes(cat)) {
        passedRules.push(`Income category (${cat}) matches permitted categories: [${rules.allowedIncomeCategories.join(', ')}]`);
      } else {
        failedRules.push(`Income category (${cat}) is not eligible for this scheme.`);
        reasons.push(`Scheme requires household category in: ${rules.allowedIncomeCategories.join(', ')}, but found: ${cat}`);
      }
    }

    // 4. District check
    if (rules.allowedDistricts && rules.allowedDistricts.length > 0) {
      if (rules.allowedDistricts.includes(person.district)) {
        passedRules.push(`District residency verified in: ${person.district}`);
      } else {
        failedRules.push(`Residency district (${person.district}) is not within targeted districts`);
        reasons.push(`Scheme is currently active only in: ${rules.allowedDistricts.join(', ')}`);
      }
    }

    // 5. GRANT UNIT LOGIC (INDIVIDUAL vs HOUSEHOLD vs PROPERTY)
    if (rules.oncePerGrantUnit) {
      if (scheme.grant_unit === 'INDIVIDUAL') {
        const priorIndividualBenefit = ledger.find(
          (b) => (b.scheme_id === scheme.id || b.scheme_id === scheme.code) && b.person_uid === params.applicantPersonUid && b.status === 'SUCCESS'
        );
        if (priorIndividualBenefit) {
          failedRules.push(`Grant unit INDIVIDUAL: applicant has already received this benefit on ${priorIndividualBenefit.disbursed_at}`);
          reasons.push(`You have already received this individual benefit.`);
          evidence.priorBenefitRef = priorIndividualBenefit.transaction_ref;
        } else {
          passedRules.push('Grant unit INDIVIDUAL: No prior benefit disbursed to applicant.');
        }
      } else if (scheme.grant_unit === 'HOUSEHOLD') {
        // Must check if anyone in the applicant's current household has already received it
        if (householdUid) {
          const currentMembers = memberships
            .filter((m) => m.household_uid === householdUid && m.is_current)
            .map((m) => m.person_uid);

          const priorHouseholdBenefit = ledger.find(
            (b) =>
              (b.scheme_id === scheme.id || b.scheme_id === scheme.code) &&
              b.status === 'SUCCESS' &&
              (b.household_uid === householdUid || currentMembers.includes(b.person_uid))
          );

          if (priorHouseholdBenefit) {
            failedRules.push(`Grant unit HOUSEHOLD: benefit already disbursed to household member (${priorHouseholdBenefit.person_uid})`);
            reasons.push(`A member of your household has already received this household-level grant.`);
            evidence.priorDisbursedHousehold = priorHouseholdBenefit.household_uid;
          } else {
            passedRules.push('Grant unit HOUSEHOLD: No member of this household has received this grant.');
          }
        }
      } else if (scheme.grant_unit === 'PROPERTY') {
        // Benefit stays with the property, even across household separations!
        if (propertyUid) {
          const priorPropertyBenefit = ledger.find(
            (b) => (b.scheme_id === scheme.id || b.scheme_id === scheme.code) && b.property_uid === propertyUid && b.status === 'SUCCESS'
          );

          if (priorPropertyBenefit) {
            failedRules.push(`Grant unit PROPERTY: toilet/infrastructure grant already disbursed to property ${propertyUid}`);
            reasons.push(`This property has already availed this property-level benefit (Toilet/Housing Grant).`);
            evidence.priorDisbursedProperty = propertyUid;
            evidence.priorTransactionRef = priorPropertyBenefit.transaction_ref;
          } else {
            passedRules.push(`Grant unit PROPERTY: No prior grant recorded for property ${propertyUid}.`);
          }
        }
      }
    }

    // 6. Explicit guest profile simulation overrides
    if (params.guestProfile?.hasToilet && (scheme.grant_unit === 'PROPERTY' || scheme.code.includes('TOILET') || scheme.code.includes('HOUSING'))) {
      failedRules.push('Grant unit PROPERTY: Applicant reported existing sanitary toilet / pucca house facility');
      reasons.push('Property already has an active facility. This scheme is intended for dwellings without prior infrastructure.');
    }
    if (params.guestProfile?.hasExistingBenefit) {
      failedRules.push(`Grant unit ${scheme.grant_unit}: Applicant reported prior benefit availed`);
      reasons.push('Prior disbursement record indicated for this grant unit.');
    }

    const eligible = failedRules.length === 0;

    return {
      eligible,
      schemeId: scheme.id,
      schemeCode: scheme.code,
      grantUnit: scheme.grant_unit,
      passedRules,
      failedRules,
      reasons,
      evidence,
    };
  }

  // Proactive Eligibility Check
  findProactiveEligibleSchemes(personUid: string): Array<{ scheme: any; result: EligibilityResult }> {
    const activeSchemes = db.getTable('schemes').filter((s) => s.active);
    const results: Array<{ scheme: any; result: EligibilityResult }> = [];

    for (const scheme of activeSchemes) {
      try {
        const evalResult = this.evaluateEligibility({
          schemeCode: scheme.code,
          applicantPersonUid: personUid,
        });

        if (evalResult.eligible) {
          // Check if applicant already applied
          const apps = db.getTable('applications');
          const alreadyApplied = apps.some(
            (a) => a.applicant_person_uid === personUid && a.scheme_id === scheme.id
          );
          if (!alreadyApplied) {
            results.push({ scheme, result: evalResult });
          }
        }
      } catch {
        // Skip un-evaluable schemes
      }
    }

    return results;
  }

  // Scheme Bundles Evaluation (One call evaluates all schemes in a bundle)
  evaluateBundle(bundleCode: string, applicantPersonUid: string) {
    const bundles = db.getTable('scheme_bundles');
    const bundle = bundles.find((b) => b.code === bundleCode && b.is_active);
    if (!bundle) throw new NotFoundError(`Bundle not found: ${bundleCode}`);

    const schemes = db.getTable('schemes');
    const evaluationResults: Record<string, EligibilityResult> = {};
    let allEligible = true;

    for (const schemeId of bundle.scheme_ids) {
      const s = schemes.find((sc) => sc.id === schemeId);
      if (s) {
        const res = this.evaluateEligibility({
          schemeCode: s.code,
          applicantPersonUid,
        });
        evaluationResults[s.code] = res;
        if (!res.eligible) allEligible = false;
      }
    }

    return {
      bundleCode,
      bundleName: bundle.name,
      allEligible,
      schemeResults: evaluationResults,
    };
  }

  // Dynamic Re-eligibility check worker hook
  reEvaluateBeneficiary(personUid: string) {
    const ledger = db.getTable('benefit_ledger').filter((b) => b.person_uid === personUid && b.status === 'SUCCESS');
    const alerts: Array<{ schemeId: string; reason: string }> = [];

    const schemes = db.getTable('schemes');
    for (const benefit of ledger) {
      const scheme = schemes.find((s) => s.id === benefit.scheme_id);
      if (!scheme) continue;

      const evalRes = this.evaluateEligibility({
        schemeCode: scheme.code,
        applicantPersonUid: personUid,
      });

      if (!evalRes.eligible) {
        alerts.push({
          schemeId: scheme.id,
          reason: `Beneficiary no longer meets criteria: ${evalRes.reasons.join('; ')}`,
        });

        // Trigger outbox notification for officer review
        db.insert('outbox', {
          event_type: 'beneficiary.eligibility_lost',
          aggregate_type: 'BENEFIT_LEDGER',
          aggregate_id: benefit.id,
          payload: { personUid, schemeCode: scheme.code, reasons: evalRes.reasons },
          status: 'PENDING',
        });
      }
    }

    return alerts;
  }

  private calculateAge(dobString: string): number {
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }
}

export const rulesEngineService = new RulesEngineService();
