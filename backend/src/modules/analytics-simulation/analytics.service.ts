import { db } from '../../core/database/db';
import { rulesEngineService } from '../schemes-rules/rules-engine.service';
import { duplicateFraudIntelService } from '../duplicate-intel/duplicate-intel.service';

export class AnalyticsSimulationService {
  // Live Analytics Dashboard
  getPlatformAnalytics() {
    const apps = db.getTable('applications');
    const ledger = db.getTable('benefit_ledger');
    const persons = db.getTable('persons');
    const reviews = db.getTable('reviews');
    const slaTimers = db.getTable('sla_timers');
    const schemes = db.getTable('schemes');

    // 1. Live Savings Counter
    let liveSavingsInr = 0;
    let duplicatesCaughtCount = 0;
    const flagsByDistrict: Record<string, number> = {};

    for (const app of apps) {
      if (app.status === 'FLAGGED' || app.risk_score === 'HIGH') {
        const applicant = persons.find((p) => p.person_uid === app.applicant_person_uid && p.is_current);
        const dist = applicant?.district || 'UNKNOWN';
        flagsByDistrict[dist] = (flagsByDistrict[dist] || 0) + 1;
      }
      if (app.risk_explanation?.matchedType || app.status === 'FLAGGED') {
        duplicatesCaughtCount++;
        const amount = Number(app.evaluation_snapshot?.benefitAmount || 5000);
        liveSavingsInr += amount;
      }
    }

    // 2. Total Disbursed Public Money
    const totalDisbursedInr = ledger
      .filter((b) => b.status === 'SUCCESS')
      .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    // 3. Scheme Utilisation
    const schemeUtilisation: Record<string, { name: string; applications: number; disbursed: number }> = {};
    for (const s of schemes) {
      const schemeApps = apps.filter((a) => a.scheme_id === s.id).length;
      const schemeDisbursed = ledger
        .filter((b) => b.scheme_id === s.id && b.status === 'SUCCESS')
        .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

      schemeUtilisation[s.code] = {
        name: s.name,
        applications: schemeApps,
        disbursed: schemeDisbursed,
      };
    }

    // 4. Officer Performance & Approval Rates
    const officerStats: Record<string, { total: number; approved: number; rejected: number; approvalRate: string }> = {};
    for (const r of reviews) {
      if (!officerStats[r.officer_user_id]) {
        officerStats[r.officer_user_id] = { total: 0, approved: 0, rejected: 0, approvalRate: '0%' };
      }
      const st = officerStats[r.officer_user_id];
      st.total++;
      if (r.decision === 'APPROVE') st.approved++;
      if (r.decision === 'REJECT') st.rejected++;
      st.approvalRate = `${Math.round((st.approved / st.total) * 100)}%`;
    }

    // 5. SLA Breaches
    const slaBreaches = slaTimers.filter((t) => t.escalated || new Date(t.deadline_at) < new Date()).length;

    // 6. Fraud Rings Summary
    const fraudRings = duplicateFraudIntelService.detectFraudRings();

    return {
      overview: {
        totalPersonsSeeded: persons.filter((p) => p.is_current).length,
        totalApplications: apps.length,
        duplicatesCaughtCount,
        liveSavingsInr,
        totalDisbursedInr,
        slaBreaches,
      },
      flagsByDistrict,
      schemeUtilisation,
      officerApprovalRates: officerStats,
      fraudRingsSummary: {
        activeRingsDetected: fraudRings.length,
        rings: fraudRings,
      },
      officerAnomalies: duplicateFraudIntelService.detectOfficerAnomalies(),
    };
  }

  // What-if Policy Simulator (Replays rule change over population)
  runWhatIfSimulation(params: {
    simulationName: string;
    schemeCode: string;
    proposedChanges: {
      minAge?: number;
      maxAge?: number;
      allowedIncomeCategories?: string[]; // e.g. add 'APL'
      maxAnnualIncome?: number;
      newBenefitAmount?: number;
    };
  }) {
    const persons = db.getTable('persons').filter((p) => p.is_current);
    const schemes = db.getTable('schemes');
    const scheme = schemes.find((s) => s.code === params.schemeCode);
    if (!scheme) throw new Error(`Scheme not found: ${params.schemeCode}`);

    let newlyEligibleCount = 0;
    let newlyIneligibleCount = 0;
    const affectedDistricts: Record<string, number> = {};
    const benefitAmount = params.proposedChanges.newBenefitAmount || 10000;

    // Sample population for simulation
    const sample = persons.slice(0, 1000);

    for (const p of sample) {
      const baseline = rulesEngineService.evaluateEligibility({
        schemeCode: params.schemeCode,
        applicantPersonUid: p.person_uid,
      });

      // Compute simulated result with proposed rules
      const age = this.calculateAge(p.date_of_birth);
      let simulatedEligible = true;

      if (params.proposedChanges.minAge !== undefined && age < params.proposedChanges.minAge) {
        simulatedEligible = false;
      }
      if (params.proposedChanges.maxAge !== undefined && age > params.proposedChanges.maxAge) {
        simulatedEligible = false;
      }

      if (!baseline.eligible && simulatedEligible) {
        newlyEligibleCount++;
        affectedDistricts[p.district] = (affectedDistricts[p.district] || 0) + 1;
      } else if (baseline.eligible && !simulatedEligible) {
        newlyIneligibleCount++;
        affectedDistricts[p.district] = (affectedDistricts[p.district] || 0) + 1;
      }
    }

    const estimatedCostDelta = newlyEligibleCount * benefitAmount - newlyIneligibleCount * benefitAmount;

    const simRecord = db.insert('simulations', {
      name: params.simulationName,
      proposed_rule_change: params.proposedChanges,
      total_evaluated: sample.length,
      newly_eligible_count: newlyEligibleCount,
      newly_ineligible_count: newlyIneligibleCount,
      estimated_cost_delta: estimatedCostDelta,
      affected_districts: affectedDistricts,
      status: 'COMPLETED',
    });

    return {
      simulationId: simRecord.id,
      name: params.simulationName,
      evaluatedPopulation: sample.length,
      newlyEligibleCount,
      newlyIneligibleCount,
      estimatedCostDeltaInr: estimatedCostDelta,
      affectedDistricts,
    };
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

export const analyticsSimulationService = new AnalyticsSimulationService();
