import { describe, expect, it } from 'vitest';
import {
  ApiErrorResponseSchema,
  EligibleTeamsResponseSchema,
  EscalationScanResultSchema,
  HealthResponseSchema,
  IncidentActiveAssignmentSchema,
  IncidentDetailSchema,
  IncidentReviewInputSchema,
  OperatorCloseInputSchema,
  PublicIncidentCreateInputSchema,
  ResponderUpdateInputSchema,
  TeamAssignmentInputSchema,
  TeamAssignmentResultSchema,
  TeamReassignmentInputSchema,
  TeamReassignmentResultSchema,
} from '../src/index.js';

const requestId = '3c2c4511-22b9-4bcb-a548-5e9c125b8a04';

describe('shared API contracts', () => {
  it('accepts a health response with a server-generated timestamp and request ID', () => {
    expect(
      HealthResponseSchema.safeParse({
        data: {
          status: 'ok',
          service: 'godavari-api',
          timestamp: '2026-10-26T12:00:00.000Z',
        },
        requestId,
      }).success,
    ).toBe(true);
  });

  it('rejects a health response that includes a secret-bearing field', () => {
    expect(
      HealthResponseSchema.safeParse({
        data: {
          status: 'ok',
          service: 'godavari-api',
          timestamp: '2026-10-26T12:00:00.000Z',
          apiKey: 'must-not-be-returned',
        },
        requestId,
      }).success,
    ).toBe(false);
  });

  it('requires a valid request ID in a common error response', () => {
    expect(
      ApiErrorResponseSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found', requestId },
      }).success,
    ).toBe(true);
    expect(
      ApiErrorResponseSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'client-value' },
      }).success,
    ).toBe(false);
  });

  it('validates public incident submission with zone and confirmed location', () => {
    const valid = {
      clientRequestId: '00000000-0000-4000-8000-000000000099',
      category: 'MEDICAL_ASSISTANCE',
      summary: 'Pilgrim collapsed near south exit',
      zoneId: '00000000-0000-4000-8000-000000000201',
      landmark: 'Near Exit Gate 3',
      callbackPhone: '+919876543210',
      locationSource: 'LANDMARK',
      locationConfirmed: true,
    };
    expect(PublicIncidentCreateInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects public incident submission without location confirmation', () => {
    const invalid = {
      clientRequestId: '00000000-0000-4000-8000-000000000099',
      category: 'MEDICAL_ASSISTANCE',
      summary: 'Pilgrim collapsed near south exit',
      zoneId: '00000000-0000-4000-8000-000000000201',
      locationSource: 'LANDMARK',
      locationConfirmed: false,
    };
    expect(PublicIncidentCreateInputSchema.safeParse(invalid).success).toBe(false);
  });

  it('requires coordinates when location source is GPS', () => {
    const missingCoords = {
      clientRequestId: '00000000-0000-4000-8000-000000000099',
      category: 'INFRASTRUCTURE',
      summary: 'Broken electrical cable sparking near water station',
      zoneId: '00000000-0000-4000-8000-000000000201',
      locationSource: 'GPS',
      locationConfirmed: true,
    };
    expect(PublicIncidentCreateInputSchema.safeParse(missingCoords).success).toBe(false);

    const withCoords = {
      ...missingCoords,
      latitude: 17.001234,
      longitude: 81.789012,
      locationAccuracyM: 10,
    };
    expect(PublicIncidentCreateInputSchema.safeParse(withCoords).success).toBe(true);
  });

  it('validates incident review input with status, priority, and notes', () => {
    const validReview = {
      status: 'UNDER_REVIEW',
      priority: 'URGENT',
      reviewNotes: 'High crowd pressure reported at Ghat 2 entrance.',
    };
    expect(IncidentReviewInputSchema.safeParse(validReview).success).toBe(true);
  });

  it('rejects an empty review update with no changes', () => {
    expect(IncidentReviewInputSchema.safeParse({}).success).toBe(false);
  });

  it('requires a cancellation reason when cancelling an incident', () => {
    const invalidCancel = {
      status: 'CANCELLED',
      cancellationReason: '',
    };
    expect(IncidentReviewInputSchema.safeParse(invalidCancel).success).toBe(false);

    const validCancel = {
      status: 'CANCELLED',
      cancellationReason: 'False alarm confirmed by patrol unit.',
    };
    expect(IncidentReviewInputSchema.safeParse(validCancel).success).toBe(true);
  });

  it('requires a target incident ID when marking as duplicate', () => {
    const invalidDuplicate = {
      status: 'DUPLICATE',
    };
    expect(IncidentReviewInputSchema.safeParse(invalidDuplicate).success).toBe(false);

    const validDuplicate = {
      status: 'DUPLICATE',
      duplicateOfIncidentId: '00000000-0000-4000-8000-000000000101',
      reviewNotes: 'Duplicate of earlier heat exhaustion report.',
    };
    expect(IncidentReviewInputSchema.safeParse(validDuplicate).success).toBe(true);
  });

  it('parses an incident detail record with audit events', () => {
    const detail = {
      id: '00000000-0000-4000-8000-000000000101',
      category: 'MEDICAL_ASSISTANCE',
      priority: 'HIGH',
      status: 'UNDER_REVIEW',
      summary: 'Medical assistance requested at Ghat 2',
      reportedAt: '2026-10-29T10:00:00.000Z',
      zoneId: '00000000-0000-4000-8000-000000000201',
      zoneName: 'Kotilingala Ghat',
      zoneCode: 'KG-01',
      locationSource: 'GPS',
      landmark: 'Main pavilion',
      latitude: 17.0012,
      longitude: 81.7891,
      locationAccuracyM: 8.5,
      locationCapturedAt: '2026-10-29T10:00:00.000Z',
      locationIsFictional: false,
      isDemo: false,
      duplicateOfIncidentId: null,
      reviewNotes: 'Operator contacted first-aid station.',
      cancellationReason: null,
      reviewedByProfileId: '00000000-0000-4000-8000-000000000301',
      reviewedByName: 'Senior Operator',
      reviewedAt: '2026-10-29T10:02:00.000Z',
      events: [
        {
          id: '00000000-0000-4000-8000-000000000401',
          incidentId: '00000000-0000-4000-8000-000000000101',
          actorProfileId: null,
          eventType: 'REPORT_CREATED',
          statusBefore: null,
          statusAfter: null,
          notes: null,
          occurredAt: '2026-10-29T10:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000402',
          incidentId: '00000000-0000-4000-8000-000000000101',
          actorProfileId: '00000000-0000-4000-8000-000000000301',
          actorDisplayName: 'Senior Operator',
          eventType: 'STATUS_CHANGED',
          statusBefore: 'REPORTED',
          statusAfter: 'UNDER_REVIEW',
          notes: null,
          occurredAt: '2026-10-29T10:02:00.000Z',
        },
      ],
    };
    expect(IncidentDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('validates eligible teams candidate response with transparent reasons', () => {
    const response = {
      incidentId: '00000000-0000-4000-8000-000000000101',
      incidentCategory: 'MEDICAL_ASSISTANCE',
      incidentZoneId: '00000000-0000-4000-8000-000000000201',
      incidentZoneName: 'Kotilingala Ghat',
      teams: [
        {
          id: '00000000-0000-4000-8000-000000000301',
          teamCode: 'MED-01',
          name: 'First Aid River Squad',
          capabilities: ['first_aid', 'welfare_check'],
          dutyStatus: 'ON_DUTY',
          serviceZones: [
            {
              id: '00000000-0000-4000-8000-000000000201',
              name: 'Kotilingala Ghat',
              zoneCode: 'KG-01',
            },
          ],
          isAvailable: true,
          activeAssignment: null,
          isEligible: true,
          isRecommended: true,
          suitabilityScore: 100,
          reasons: [
            'Covers incident service zone Kotilingala Ghat (Zone-based match)',
            'Verified capability: first_aid, welfare_check for Medical Assistance',
            'Team is on duty and available for assignment',
          ],
        },
      ],
    };
    expect(EligibleTeamsResponseSchema.safeParse(response).success).toBe(true);
  });

  it('validates team assignment input with deadline', () => {
    expect(
      TeamAssignmentInputSchema.safeParse({
        teamId: '00000000-0000-4000-8000-000000000301',
        acknowledgementDeadlineMinutes: 15,
      }).success,
    ).toBe(true);

    expect(
      TeamAssignmentInputSchema.safeParse({
        teamId: '00000000-0000-4000-8000-000000000301',
      }).success,
    ).toBe(true);

    // Rejects invalid deadline
    expect(
      TeamAssignmentInputSchema.safeParse({
        teamId: '00000000-0000-4000-8000-000000000301',
        acknowledgementDeadlineMinutes: 0,
      }).success,
    ).toBe(false);
  });

  it('validates team assignment result schema', () => {
    const result = {
      assignmentId: '00000000-0000-4000-8000-000000000501',
      incidentId: '00000000-0000-4000-8000-000000000101',
      teamId: '00000000-0000-4000-8000-000000000301',
      teamCode: 'MED-01',
      teamName: 'First Aid River Squad',
      status: 'PENDING',
      assignedAt: '2026-10-29T10:00:00.000Z',
      acknowledgementDeadline: '2026-10-29T10:15:00.000Z',
      incidentStatus: 'ASSIGNED',
    };
    expect(TeamAssignmentResultSchema.safeParse(result).success).toBe(true);
  });

  it('validates responder update inputs and rules', () => {
    // ACKNOWLEDGE
    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'ACKNOWLEDGE',
        notes: 'Acknowledged dispatch',
      }).success,
    ).toBe(true);

    // EN_ROUTE
    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'EN_ROUTE',
      }).success,
    ).toBe(true);

    // ON_SCENE
    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'ON_SCENE',
      }).success,
    ).toBe(true);

    // RESOLVE requires outcome
    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'RESOLVE',
      }).success,
    ).toBe(false);

    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'RESOLVE',
        outcome: 'Patient received first aid and hydrated.',
      }).success,
    ).toBe(true);

    // REQUEST_SUPPORT requires notes
    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'REQUEST_SUPPORT',
      }).success,
    ).toBe(false);

    expect(
      ResponderUpdateInputSchema.safeParse({
        action: 'REQUEST_SUPPORT',
        notes: 'Need crowd control assistance.',
      }).success,
    ).toBe(true);
  });

  it('validates operator closure inputs', () => {
    expect(OperatorCloseInputSchema.safeParse({}).success).toBe(true);
    expect(
      OperatorCloseInputSchema.safeParse({
        notes: 'Closure verified with ghat police inspector.',
      }).success,
    ).toBe(true);
  });

  it('validates stage 8 escalation and reassignment schemas', () => {
    // IncidentActiveAssignmentSchema with overdue and escalation fields
    const activeAssignment = {
      id: '00000000-0000-4000-8000-000000000801',
      teamId: '00000000-0000-4000-8000-000000000201',
      teamCode: 'MED-01',
      teamName: 'Medical Rapid Response Alpha',
      status: 'PENDING',
      assignedAt: '2026-10-26T12:00:00.000Z',
      acknowledgementDeadline: '2026-10-26T12:01:00.000Z',
      isOverdue: true,
      escalatedAt: '2026-10-26T12:01:05.000Z',
      reassignmentReason: null,
    };
    expect(IncidentActiveAssignmentSchema.safeParse(activeAssignment).success).toBe(true);

    // TeamReassignmentInputSchema requires newTeamId and non-empty reason
    expect(
      TeamReassignmentInputSchema.safeParse({
        newTeamId: '00000000-0000-4000-8000-000000000202',
        reason: '',
      }).success,
    ).toBe(false);

    expect(
      TeamReassignmentInputSchema.safeParse({
        newTeamId: '00000000-0000-4000-8000-000000000202',
        reason: 'Team unresponsive past 60s prototype deadline',
        acknowledgementDeadlineSeconds: 60,
      }).success,
    ).toBe(true);

    // TeamReassignmentResultSchema
    expect(
      TeamReassignmentResultSchema.safeParse({
        incidentId: '00000000-0000-4000-8000-000000000301',
        supersededAssignmentId: '00000000-0000-4000-8000-000000000801',
        supersededTeamCode: 'MED-01',
        newAssignmentId: '00000000-0000-4000-8000-000000000802',
        newTeamId: '00000000-0000-4000-8000-000000000202',
        newTeamCode: 'MED-02',
        newTeamName: 'Medical Rapid Response Bravo',
        status: 'PENDING',
        assignedAt: '2026-10-26T12:01:10.000Z',
        acknowledgementDeadline: '2026-10-26T12:02:10.000Z',
        incidentStatus: 'ASSIGNED',
        reassignmentReason: 'Team unresponsive past 60s prototype deadline',
      }).success,
    ).toBe(true);

    // EscalationScanResultSchema
    expect(
      EscalationScanResultSchema.safeParse({
        scannedAt: '2026-10-26T12:01:15.000Z',
        escalatedCount: 1,
        escalatedAssignmentIds: ['00000000-0000-4000-8000-000000000801'],
      }).success,
    ).toBe(true);
  });
});
