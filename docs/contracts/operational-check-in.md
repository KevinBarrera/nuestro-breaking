# Operational check-in boundary

An authenticated event-scoped admin may `POST /admin/events/:eventId/registrations/:registrationId/check-in` once for a confirmed registration. The server records an immutable event attendance fact with actor, session and server timestamp; this does not alter registration or payment state.

After event check-in, the same authority may `POST /admin/events/:eventId/registrations/:registrationId/activities/:activityId/check-in` once per actual same-event activity enrollment. Workshop and competition are examples, not an exhaustive kind list: eligibility is enrollment, not a kind enum. A general-pass-only registration has no activity enrollment. Activity facts bind the enrollment and earlier event fact, actor/session and server time; concurrent repeats return a conflict rather than a second fact.

Missing/invalid event admission, unenrolled or cross-event activity, pending/voided registration and general-only requests are explicitly denied without writing attendance or changing registration/payment. Missing or unauthorized admin credentials, origin or CSRF are denied before mutation. Exceptions require authorized human resolution outside this endpoint; no staff role, override or automatic correction is implied.
