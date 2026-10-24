import { db } from '../../core/database/db';
import { cryptoService } from '../../core/crypto/envelope';
import { auditTrustService } from '../audit-trust/audit.service';
import { NotFoundError, ValidationError } from '../../core/errors/rfc9457';

export class RecordsService {
  // Create Lifelong Person Record
  async createPerson(params: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    phone: string;
    email?: string;
    address_line: string;
    district: string;
    state: string;
    pincode: string;
    identifiers?: Array<{ id_type: string; id_value: string }>;
    photo_phash?: string;
    exif_data?: any;
  }) {
    const personUid = `PER-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;
    const fullName = `${params.first_name} ${params.last_name}`;

    // Store the full AES-GCM envelope (ciphertext + iv + authTag) so it can be decrypted later
    const phoneEncrypted = JSON.stringify(cryptoService.encrypt(params.phone));
    const emailEncrypted = params.email ? JSON.stringify(cryptoService.encrypt(params.email)) : undefined;

    const personRecord = db.insert('persons', {
      person_uid: personUid,
      first_name: params.first_name,
      last_name: params.last_name,
      full_name: fullName,
      date_of_birth: params.date_of_birth,
      gender: params.gender,
      phone_encrypted: phoneEncrypted,
      email_encrypted: emailEncrypted,
      address_line: params.address_line,
      district: params.district,
      state: params.state,
      pincode: params.pincode,
      photo_phash: params.photo_phash || null,
      exif_data: params.exif_data || null,
      status: 'ALIVE',
      valid_from: new Date().toISOString(),
      valid_to: '9999-12-31T23:59:59.000Z',
      recorded_from: new Date().toISOString(),
      recorded_to: '9999-12-31T23:59:59.000Z',
      is_current: true,
    });

    // Store identifiers with masking, envelope encryption and blind HMAC hash
    if (params.identifiers) {
      for (const idObj of params.identifiers) {
        db.insert('identifiers', {
          person_uid: personUid,
          id_type: idObj.id_type,
          id_value_masked: cryptoService.mask(idObj.id_value, idObj.id_type.includes('AADHAAR') ? 'AADHAAR' : 'BANK'),
          id_value_encrypted: cryptoService.encrypt(idObj.id_value).ciphertext,
          id_hash_hmac: cryptoService.hmacHash(idObj.id_value),
        });
      }
    }

    // Outbox event
    db.insert('outbox', {
      event_type: 'person.created',
      aggregate_type: 'PERSON',
      aggregate_id: personUid,
      payload: { personUid, fullName, district: params.district },
      status: 'PENDING',
    });

    auditTrustService.appendAuditLog({
      actor_id: 'SYSTEM',
      actor_role: 'SYSTEM',
      action: 'PERSON_RECORD_CREATED',
      entity_type: 'PERSON',
      entity_id: personUid,
      details: { personUid, fullName, district: params.district },
    });

    return personRecord;
  }

  // Create Property with unique digital ID
  createProperty(params: {
    property_type: string;
    normalized_address: string;
    district: string;
    pincode: string;
    geo_lat?: number;
    geo_lng?: number;
    area_sqft?: number;
  }) {
    const propertyUid = `PROP-${params.district.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const propertyRecord = db.insert('properties', {
      property_uid: propertyUid,
      property_type: params.property_type,
      normalized_address: params.normalized_address,
      district: params.district,
      pincode: params.pincode,
      geo_lat: params.geo_lat || 28.6139,
      geo_lng: params.geo_lng || 77.209,
      area_sqft: params.area_sqft || 650,
      valid_from: new Date().toISOString(),
      valid_to: '9999-12-31T23:59:59.000Z',
      recorded_from: new Date().toISOString(),
      recorded_to: '9999-12-31T23:59:59.000Z',
      is_current: true,
    });
    return propertyRecord;
  }

  // Create Household linked to Property
  createHousehold(params: {
    property_uid: string;
    head_person_uid: string;
    income_category: 'BPL' | 'APL' | 'OTHER';
    annual_income: number;
    district: string;
    member_uids?: string[];
  }) {
    const householdUid = `HH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 899 + 100)}`;
    const annualIncomeEncrypted = cryptoService.encrypt(params.annual_income.toString()).ciphertext;

    const household = db.insert('households', {
      household_uid: householdUid,
      property_uid: params.property_uid,
      head_person_uid: params.head_person_uid,
      income_category: params.income_category,
      annual_income_encrypted: annualIncomeEncrypted,
      district: params.district,
      valid_from: new Date().toISOString(),
      valid_to: '9999-12-31T23:59:59.000Z',
      recorded_from: new Date().toISOString(),
      recorded_to: '9999-12-31T23:59:59.000Z',
      is_current: true,
    });

    // Add head membership
    db.insert('household_memberships', {
      household_uid: householdUid,
      person_uid: params.head_person_uid,
      role_in_household: 'HEAD',
      valid_from: new Date().toISOString(),
      valid_to: '9999-12-31T23:59:59.000Z',
      recorded_from: new Date().toISOString(),
      recorded_to: '9999-12-31T23:59:59.000Z',
      is_current: true,
    });

    // Add other members
    if (params.member_uids) {
      for (const mUid of params.member_uids) {
        if (mUid !== params.head_person_uid) {
          db.insert('household_memberships', {
            household_uid: householdUid,
            person_uid: mUid,
            role_in_household: 'MEMBER',
            valid_from: new Date().toISOString(),
            valid_to: '9999-12-31T23:59:59.000Z',
            recorded_from: new Date().toISOString(),
            recorded_to: '9999-12-31T23:59:59.000Z',
            is_current: true,
          });
        }
      }
    }

    return household;
  }

  // Lifelong Person Timeline
  getPersonTimeline(personUid: string) {
    const persons = db.getTable('persons');
    const person = persons.find((p) => p.person_uid === personUid && p.is_current);
    if (!person) throw new NotFoundError('Person not found');

    const lifeEvents = db.getTable('life_events').filter((e) => e.person_uid === personUid);
    const memberships = db.getTable('household_memberships').filter((m) => m.person_uid === personUid);
    const benefits = db.getTable('benefit_ledger').filter((b) => b.person_uid === personUid);
    const incomeRecords = db.getTable('income_records').filter((i) => i.person_uid === personUid);

    const timeline: Array<{ timestamp: string; type: string; summary: string; details: any }> = [];

    // Birth timeline point
    timeline.push({
      timestamp: person.date_of_birth,
      type: 'BIRTH',
      summary: `Born: ${person.full_name}`,
      details: { district: person.district, gender: person.gender },
    });

    for (const le of lifeEvents) {
      timeline.push({
        timestamp: le.effective_date,
        type: le.event_type,
        summary: `Life event: ${le.event_type}`,
        details: le.event_payload,
      });
    }

    for (const m of memberships) {
      timeline.push({
        timestamp: m.valid_from,
        type: 'HOUSEHOLD_CHANGE',
        summary: `Household membership: ${m.role_in_household} in ${m.household_uid}`,
        details: { household_uid: m.household_uid, is_current: m.is_current },
      });
    }

    for (const b of benefits) {
      timeline.push({
        timestamp: b.disbursed_at,
        type: 'BENEFIT_DISBURSED',
        summary: `Received grant of ₹${b.amount} for scheme ${b.scheme_id}`,
        details: { grant_unit: b.grant_unit, transaction_ref: b.transaction_ref },
      });
    }

    for (const inc of incomeRecords) {
      timeline.push({
        timestamp: inc.valid_from,
        type: 'INCOME_ASSESSMENT',
        summary: `Income assessed as ${inc.category}`,
        details: { category: inc.category, verified: inc.verified },
      });
    }

    // Sort chronologically
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      person: {
        person_uid: person.person_uid,
        full_name: person.full_name,
        date_of_birth: person.date_of_birth,
        district: person.district,
        status: person.status,
      },
      timeline,
    };
  }

  // Life Event execution (BIRTH, MARRIAGE, HOUSEHOLD_SEPARATION, MERGE, DEATH, ADDRESS_CHANGE)
  async executeLifeEvent(params: {
    event_type: 'BIRTH' | 'MARRIAGE' | 'HOUSEHOLD_SEPARATION' | 'MERGE' | 'DEATH' | 'ADDRESS_CHANGE';
    person_uid: string;
    effective_date?: string;
    payload: Record<string, any>;
    source_integration?: string;
  }) {
    const effectiveDate = params.effective_date || new Date().toISOString();

    const eventRecord = db.insert('life_events', {
      person_uid: params.person_uid,
      event_type: params.event_type,
      event_payload: params.payload,
      effective_date: effectiveDate,
      source_integration: params.source_integration || 'MANUAL',
      is_compensated: false,
      compensating_event_id: null,
      recorded_at: new Date().toISOString(),
    });

    if (params.event_type === 'DEATH') {
      // Bitemporally close person record and mark deceased
      db.bitemporalUpdate('persons', 'person_uid', params.person_uid, {
        status: 'DECEASED',
      });

      // Stop any pending or ongoing benefit ledger streams & alert officer
      db.insert('outbox', {
        event_type: 'person.deceased',
        aggregate_type: 'PERSON',
        aggregate_id: params.person_uid,
        payload: { personUid: params.person_uid, deathDate: effectiveDate },
        status: 'PENDING',
      });
    } else if (params.event_type === 'HOUSEHOLD_SEPARATION') {
      // Split members into new household
      const { old_household_uid, new_property_uid, separating_member_uids, new_head_uid, income_category } = params.payload;
      
      const newHousehold = this.createHousehold({
        property_uid: new_property_uid,
        head_person_uid: new_head_uid,
        income_category: income_category || 'APL',
        annual_income: 150000,
        district: params.payload.district || 'CENTRAL',
        member_uids: separating_member_uids,
      });

      // Close old memberships for separating members
      const memberships = db.getTable('household_memberships');
      for (const mUid of separating_member_uids) {
        const oldMem = memberships.find((m) => m.household_uid === old_household_uid && m.person_uid === mUid && m.is_current);
        if (oldMem) {
          oldMem.is_current = false;
          oldMem.valid_to = effectiveDate;
        }
      }

      db.insert('outbox', {
        event_type: 'household.split',
        aggregate_type: 'HOUSEHOLD',
        aggregate_id: newHousehold.household_uid,
        payload: { old_household_uid, new_household_uid: newHousehold.household_uid },
        status: 'PENDING',
      });
    } else if (params.event_type === 'ADDRESS_CHANGE') {
      db.bitemporalUpdate('persons', 'person_uid', params.person_uid, {
        address_line: params.payload.address_line,
        district: params.payload.district,
        pincode: params.payload.pincode,
      });
    }

    auditTrustService.appendAuditLog({
      actor_id: params.source_integration || 'OFFICER',
      actor_role: 'OFFICIAL',
      action: `LIFE_EVENT_${params.event_type}`,
      entity_type: 'PERSON',
      entity_id: params.person_uid,
      details: params.payload,
    });

    return eventRecord;
  }
}

export const recordsService = new RecordsService();
