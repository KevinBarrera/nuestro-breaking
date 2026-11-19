// Response of the admin assignment (#377): the competition, its new number for the registration
// and the one it retired, null on a first assignment.
export type CompetitorNumberAssignment = {
  registrationId: string;
  activityId: string;
  competitorNumber: number;
  previousCompetitorNumber: number | null;
};

// A number the registration holds in one competition (#377), as the admin readers return it.
export type HeldCompetitorNumber = { activityId: string; competitorNumber: number };
