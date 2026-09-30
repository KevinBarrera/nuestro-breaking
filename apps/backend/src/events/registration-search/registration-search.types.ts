export type RegistrationSearchResult = {
  participant: { id: string; fullName: string; email: string | null; stageName: string | null };
  registration: { id: string; eventId: string; folio: string | null; status: string };
  activities: { id: string; name: string; kind: string }[];
};

export type RegistrationSearchPage = {
  total: number;
  limit: number;
  offset: number;
  results: RegistrationSearchResult[];
};
