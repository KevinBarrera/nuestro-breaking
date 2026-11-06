// Response of the admin assignment (#377): the new number and the one it retired, null on a first
// assignment.
export type CompetitorNumberAssignment = {
  registrationId: string;
  competitorNumber: number;
  previousCompetitorNumber: number | null;
};
