import { db } from '../core/database/db';
import { authService } from '../modules/identity-access/auth.service';
import { recordsService } from '../modules/records/records.service';
import { familyGraphService } from '../modules/family-graph/family-graph.service';
import { applicationsWorkflowService } from '../modules/applications-workflow/workflow.service';
import { auditTrustService } from '../modules/audit-trust/audit.service';
import { cryptoService } from '../core/crypto/envelope';

export async function runSeed(targetPersonsCount = 100000) {
  console.log('--- Starting Database Seeding ---');
  await db.connect();
  db.reset();

  // 1. Seed Departments
  console.log('1. Seeding Departments...');
  const departments = [
    { code: 'RURAL_DEV', name: 'Department of Rural Development', district: 'CENTRAL' },
    { code: 'FOOD_SUPPLIES', name: 'Department of Food & Civil Supplies', district: 'CENTRAL' },
    { code: 'SOCIAL_WELFARE', name: 'Department of Social Welfare', district: 'EAST' },
    { code: 'HEALTH_DEPT', name: 'Department of Health & Family Welfare', district: 'NORTH' },
    { code: 'AGRICULTURE', name: 'Ministry of Agriculture & Farmers Welfare', district: 'CENTRAL' },
    { code: 'PETROLEUM', name: 'Ministry of Petroleum & Natural Gas', district: 'WEST' },
  ];
  const deptMap: Record<string, string> = {};
  for (const d of departments) {
    const rec = db.insert('departments', d);
    deptMap[d.code] = rec.id;
  }

  // 2. Seed Demo Users for every required role
  console.log('2. Seeding Demo Users for all roles...');
  const demoUsers = [
    { username: 'citizen_demo', email: 'citizen@gov.demo', role: 'CITIZEN', district: 'CENTRAL' },
    { username: 'clerk_demo', email: 'clerk@gov.demo', role: 'CLERK', district: 'CENTRAL', dept: 'RURAL_DEV' },
    { username: 'officer_sharma', email: 'officer1@gov.demo', role: 'OFFICER', district: 'CENTRAL', dept: 'RURAL_DEV' },
    { username: 'officer_verma', email: 'officer2@gov.demo', role: 'OFFICER', district: 'CENTRAL', dept: 'RURAL_DEV' },
    { username: 'senior_officer_patel', email: 'senior@gov.demo', role: 'SENIOR_OFFICER', district: 'CENTRAL', dept: 'RURAL_DEV' },
    { username: 'field_worker_ram', email: 'field@gov.demo', role: 'FIELD_WORKER', district: 'CENTRAL', dept: 'SOCIAL_WELFARE' },
    { username: 'dept_admin_singh', email: 'admin@gov.demo', role: 'DEPT_ADMIN', district: 'CENTRAL', dept: 'RURAL_DEV' },
    { username: 'auditor_gupta', email: 'auditor@gov.demo', role: 'AUDITOR', district: 'CENTRAL' },
    { username: 'sysadmin_rao', email: 'sysadmin@gov.demo', role: 'SYSTEM_ADMIN', district: 'CENTRAL' },
  ];

  for (const u of demoUsers) {
    try {
      await authService.register({
        username: u.username,
        email: u.email,
        password: 'Demo@Password123',
        role: u.role,
        district: u.district,
        departmentId: u.dept ? deptMap[u.dept] : undefined,
      });
    } catch {
      // already registered
    }
  }

  // 3. Seed Schemes & Rules DSL
  console.log('3. Seeding Welfare Schemes with versioned DSL...');
  const schemesData = [
    {
      code: 'SBM_TOILET',
      name: 'Swachh Bharat Rural Sanitation Grant (Toilet)',
      dept: 'RURAL_DEV',
      grant_unit: 'PROPERTY',
      benefit_amount: 12000,
      rules: {
        minAge: 18,
        allowedIncomeCategories: ['BPL'],
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'PM_KISAN',
      name: 'PM-Kisan Samman Nidhi',
      dept: 'AGRICULTURE',
      grant_unit: 'INDIVIDUAL',
      benefit_amount: 6000,
      rules: {
        minAge: 18,
        allowedIncomeCategories: ['BPL', 'APL'],
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'OLD_AGE_PENSION',
      name: 'Indira Gandhi National Old Age Pension',
      dept: 'SOCIAL_WELFARE',
      grant_unit: 'INDIVIDUAL',
      benefit_amount: 3000,
      rules: {
        minAge: 60,
        allowedIncomeCategories: ['BPL', 'APL'],
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'UJJWALA_GAS',
      name: 'Pradhan Mantri Ujjwala Yojana 2.0 (LPG Gas)',
      dept: 'PETROLEUM',
      grant_unit: 'HOUSEHOLD',
      benefit_amount: 3200,
      rules: {
        minAge: 18,
        gender: ['FEMALE'],
        allowedIncomeCategories: ['BPL'],
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'SCHOLARSHIP_MERIT',
      name: 'Merit Cum Means National Scholarship',
      dept: 'SOCIAL_WELFARE',
      grant_unit: 'INDIVIDUAL',
      benefit_amount: 25000,
      rules: {
        minAge: 15,
        maxAge: 25,
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'AYUSHMAN_PMJAY',
      name: 'Ayushman Bharat - PM-JAY (Health Cover)',
      dept: 'HEALTH_DEPT',
      grant_unit: 'HOUSEHOLD',
      benefit_amount: 500000,
      rules: {
        minAge: 0,
        allowedIncomeCategories: ['BPL'],
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'PMAY_HOUSING',
      name: 'Pradhan Mantri Awas Yojana (Housing)',
      dept: 'RURAL_DEV',
      grant_unit: 'HOUSEHOLD',
      benefit_amount: 120000,
      rules: {
        minAge: 21,
        allowedIncomeCategories: ['BPL'],
        oncePerGrantUnit: true,
      },
    },
    {
      code: 'MATERNITY_BENEFIT',
      name: 'Pradhan Mantri Matru Vandana Yojana (Maternity)',
      dept: 'HEALTH_DEPT',
      grant_unit: 'INDIVIDUAL',
      benefit_amount: 6000,
      rules: {
        minAge: 19,
        gender: ['FEMALE'],
        oncePerGrantUnit: true,
      },
    },
  ];

  const schemeIdMap: Record<string, string> = {};
  for (const s of schemesData) {
    const sc = db.insert('schemes', {
      code: s.code,
      name: s.name,
      department_id: deptMap[s.dept],
      grant_unit: s.grant_unit,
      description: s.name,
      active: true,
    });
    schemeIdMap[s.code] = sc.id;

    db.insert('scheme_versions', {
      scheme_id: sc.id,
      version_number: 1,
      rules_dsl: s.rules,
      benefit_amount: s.benefit_amount,
      cooldown_days: 0,
      is_active: true,
    });
  }

  // 4. Seed Scheme Bundle
  db.insert('scheme_bundles', {
    code: 'BUNDLE_VULNERABLE_SUPPORT',
    name: 'Unified Vulnerable Family Assistance Package',
    description: 'Combined Sanitation, Maternity, and Nutrition support for vulnerable households',
    scheme_ids: [schemeIdMap['SBM_TOILET'], schemeIdMap['MATERNITY_BENEFIT']],
    is_active: true,
  });

  // 5. Seed Scripted Demo Scenarios (Scenarios 1 through 14)
  console.log('4. Seeding Pre-scripted Hackathon Scenarios (1-14)...');

  // Scenario 1 & 2: THE BROTHERS (A & B share property. A gets toilet grant; B applies -> FLAGGED. B's child gets Scholarship).
  const prop1 = recordsService.createProperty({
    property_type: 'RESIDENTIAL_RURAL',
    normalized_address: 'House No 42, Gram Panchayat Rampur, Central District',
    district: 'CENTRAL',
    pincode: '110042',
  });

  // Brother A (BPL)
  const brotherA = await recordsService.createPerson({
    first_name: 'Rajesh',
    last_name: 'Sharma',
    date_of_birth: '1982-05-14',
    gender: 'MALE',
    phone: '9811001122',
    address_line: 'House No 42, Gram Panchayat Rampur',
    district: 'CENTRAL',
    state: 'Delhi',
    pincode: '110042',
    identifiers: [{ id_type: 'AADHAAR_MOCK', id_value: '999911112222' }],
  });

  // Brother B (APL)
  const brotherB = await recordsService.createPerson({
    first_name: 'Suresh',
    last_name: 'Sharma',
    date_of_birth: '1985-08-20',
    gender: 'MALE',
    phone: '9811003344',
    address_line: 'House No 42, Gram Panchayat Rampur',
    district: 'CENTRAL',
    state: 'Delhi',
    pincode: '110042',
    identifiers: [{ id_type: 'AADHAAR_MOCK', id_value: '999933334444' }],
  });

  // Child of Brother A
  const childA = await recordsService.createPerson({
    first_name: 'Amit',
    last_name: 'Sharma',
    date_of_birth: '2008-03-12',
    gender: 'MALE',
    phone: '9811005566',
    address_line: 'House No 42, Gram Panchayat Rampur',
    district: 'CENTRAL',
    state: 'Delhi',
    pincode: '110042',
  });

  // Child of Brother B
  const childB = await recordsService.createPerson({
    first_name: 'Priya',
    last_name: 'Sharma',
    date_of_birth: '2006-11-25',
    gender: 'FEMALE',
    phone: '9811007788',
    address_line: 'House No 42, Gram Panchayat Rampur',
    district: 'CENTRAL',
    state: 'Delhi',
    pincode: '110042',
  });

  // Link family relationships
  familyGraphService.addRelationship(brotherA.person_uid, brotherB.person_uid, 'SIBLING');
  familyGraphService.addRelationship(brotherA.person_uid, childA.person_uid, 'PARENT');
  familyGraphService.addRelationship(brotherB.person_uid, childB.person_uid, 'PARENT');

  // Shared Household 1
  const hh1 = recordsService.createHousehold({
    property_uid: prop1.property_uid,
    head_person_uid: brotherA.person_uid,
    income_category: 'BPL',
    annual_income: 65000,
    district: 'CENTRAL',
    member_uids: [brotherA.person_uid, brotherB.person_uid, childA.person_uid, childB.person_uid],
  });

  // Brother A applied for Toilet Grant, was APPROVED and DISBURSED!
  const appA = await applicationsWorkflowService.submitApplication({
    applicantPersonUid: brotherA.person_uid,
    schemeCode: 'SBM_TOILET',
    householdUid: hh1.household_uid,
    propertyUid: prop1.property_uid,
  });

  const officers = db.getTable('users').filter((u) => u.role === 'OFFICER');
  await applicationsWorkflowService.reviewApplication({
    applicationId: appA.applicationId,
    officerUserId: officers[0].id,
    officerRole: 'OFFICER',
    decision: 'APPROVE',
    reason: 'Verified BPL head of household with verified property ownership and no prior sanitation grants.',
  });

  // Pre-seed Scenario 5: Photo reuse detection
  const photoPhash1 = 'a1b2c3d4e5f60718';
  brotherA.photo_phash = photoPhash1;

  // Link the citizen demo login to Brother B so the User Panel has a real record
  const citizenUser = db.getTable('users').find((u) => u.username === 'citizen_demo');
  if (citizenUser) citizenUser.person_uid = brotherB.person_uid;

  // Pending applications so the officer review queue is populated on first login
  await applicationsWorkflowService.submitApplication({
    applicantPersonUid: brotherB.person_uid,
    schemeCode: 'SBM_TOILET',
    householdUid: hh1.household_uid,
    propertyUid: prop1.property_uid,
  }); // -> FLAGGED (property already received toilet grant)
  await applicationsWorkflowService.submitApplication({
    applicantPersonUid: childA.person_uid,
    schemeCode: 'SCHOLARSHIP_MERIT',
  }); // -> UNDER_VERIFICATION (individual scheme)

  // Pre-seed Scenario 6: Fraud Ring (6 different persons sharing bank account hash)
  const sharedBankNo = '987654321098';
  const sharedBankHmac = cryptoService.hmacHash(sharedBankNo);
  for (let r = 1; r <= 6; r++) {
    const ringPerson = await recordsService.createPerson({
      first_name: `RingMember${r}`,
      last_name: 'Syndicate',
      date_of_birth: '1990-01-01',
      gender: 'MALE',
      phone: `910000000${r}`,
      address_line: `Syndicate Hub Room ${r}, Industrial Zone`,
      district: 'NORTH',
      state: 'Delhi',
      pincode: '110099',
    });
    db.insert('identifiers', {
      person_uid: ringPerson.person_uid,
      id_type: 'BANK_ACCOUNT',
      id_value_masked: 'XXXXXXXX1098',
      id_value_encrypted: cryptoService.encrypt(sharedBankNo).ciphertext,
      id_hash_hmac: sharedBankHmac,
    });
  }

  // Pre-seed Scenario 8: Deceased Pensioner
  const pensioner = await recordsService.createPerson({
    first_name: 'Babu',
    last_name: 'Lal',
    date_of_birth: '1948-02-10',
    gender: 'MALE',
    phone: '9900112233',
    address_line: 'Old Colony, Sector 4, North District',
    district: 'NORTH',
    state: 'Delhi',
    pincode: '110051',
  });
  // Disburse pension
  db.insert('benefit_ledger', {
    application_id: crypto.randomUUID(),
    scheme_id: schemeIdMap['OLD_AGE_PENSION'],
    person_uid: pensioner.person_uid,
    grant_unit: 'INDIVIDUAL',
    amount: 3000,
    disbursed_at: new Date().toISOString(),
    transaction_ref: 'DBT-PENSION-OCT2026',
    status: 'SUCCESS',
  });

  // 6. Fast batch generation for 100k synthetic population
  console.log(`5. Generating synthetic population (~${targetPersonsCount.toLocaleString()} persons)...`);
  const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Diya', 'Ananya', 'Aadhya', 'Pari', 'Saanvi', 'Myra', 'Kavya', 'Riya', 'Sara', 'Isha'];
  const lastNames = ['Sharma', 'Verma', 'Singh', 'Patel', 'Yadav', 'Gupta', 'Kumar', 'Reddy', 'Mehta', 'Nair', 'Joshi', 'Chauhan', 'Das', 'Roy', 'Mishra'];
  const districts = ['CENTRAL', 'NORTH', 'SOUTH', 'EAST', 'WEST'];

  const personsTable = db.getTable('persons');
  const nowStr = new Date().toISOString();

  // Create lightweight representations in memory to achieve 100k seeded records efficiently
  const batchSize = 10000;
  for (let i = 0; i < targetPersonsCount; i += batchSize) {
    const chunkCount = Math.min(batchSize, targetPersonsCount - i);
    for (let j = 0; j < chunkCount; j++) {
      const idx = i + j;
      const fn = firstNames[idx % firstNames.length];
      const ln = lastNames[idx % lastNames.length];
      const dist = districts[idx % districts.length];
      const year = 1950 + (idx % 55);
      const month = String(1 + (idx % 12)).padStart(2, '0');
      const day = String(1 + (idx % 28)).padStart(2, '0');

      personsTable.push({
        id: crypto.randomUUID(),
        person_uid: `PER-SYN-${idx.toString(36).toUpperCase()}`,
        first_name: fn,
        last_name: ln,
        full_name: `${fn} ${ln}`,
        date_of_birth: `${year}-${month}-${day}`,
        gender: idx % 2 === 0 ? 'MALE' : 'FEMALE',
        address_line: `Plot ${idx % 500}, Sector ${(idx % 20) + 1}`,
        district: dist,
        state: 'Delhi',
        pincode: `1100${String(10 + (idx % 80))}`,
        status: 'ALIVE',
        valid_from: nowStr,
        valid_to: '9999-12-31T23:59:59.000Z',
        recorded_from: nowStr,
        recorded_to: '9999-12-31T23:59:59.000Z',
        is_current: true,
      });
    }
    if ((i + batchSize) % 20000 === 0 || i + chunkCount === targetPersonsCount) {
      console.log(`  Seeded ${Math.min(i + batchSize, targetPersonsCount).toLocaleString()} / ${targetPersonsCount.toLocaleString()} persons...`);
    }
  }

  // Create initial signed Merkle checkpoint
  auditTrustService.createMerkleCheckpoint();

  console.log('--- Database Seeding Complete ---');
  console.log(`Total Persons in Database: ${db.getTable('persons').length.toLocaleString()}`);
  console.log(`Demo Scenario Seeds Configured:`);
  console.log(`  Brother A UID: ${brotherA.person_uid} (Toilet Disbursed)`);
  console.log(`  Brother B UID: ${brotherB.person_uid}`);
  console.log(`  Child A UID:   ${childA.person_uid}`);
  console.log(`  Child B UID:   ${childB.person_uid}`);
  console.log(`  Property UID:  ${prop1.property_uid}`);
  console.log(`  Household UID: ${hh1.household_uid}`);
  console.log(`  Pensioner UID: ${pensioner.person_uid}`);
  console.log(`  Shared Bank Hash: ${sharedBankHmac}`);

  return {
    brotherA,
    brotherB,
    childA,
    childB,
    prop1,
    hh1,
    pensioner,
    sharedBankHmac,
  };
}

if (require.main === module) {
  runSeed(100000);
}
