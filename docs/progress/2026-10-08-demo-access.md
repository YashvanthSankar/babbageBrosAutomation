# Demo access and local scheduling — 2026-10-08

- Removed Google OAuth client integration and its environment variables.
- Sign-in now requires name, a `@iiitdm.ac.in` email, Indian E.164 phone, and any non-empty demo password. The exact configured `PROFESSOR_EMAIL` is the admin; all other institute emails receive student access.
- A first-time student sign-in creates a local synthetic student profile. Passwords are never stored.
- Appointment slots are in-app reservations with transactional collision prevention; they are not presented as Google Calendar events.
