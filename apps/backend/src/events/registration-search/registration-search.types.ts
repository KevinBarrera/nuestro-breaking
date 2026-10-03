export type RegistrationSearchResult = {
  participant: { id: string; fullName: string; email: string | null; stageName: string | null };
  registration: {
    id: string;
    eventId: string;
    folio: string | null;
    status: string;
    checkedInAt: string | null;
  };
  activities: { id: string; name: string; kind: string; checkedInAt: string | null }[];
};

export type RegistrationSearchPage = {
  total: number;
  limit: number;
  offset: number;
  results: RegistrationSearchResult[];
};
