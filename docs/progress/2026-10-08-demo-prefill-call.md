# Demo prefill and voice-call CTA

- Added prominent student and professor shortcuts that prefill the demo sign-in form. Each shortcut generates a valid-format random Indian phone number; the student shortcut uses Narendhar and `ec24b1053@iiitdm.ac.in`, while the professor shortcut uses the configured demo professor identity.
- Added a professor-dashboard CTA that accepts an Indian E.164 number and dispatches the OmniDimension agent with a fixed synthetic attendance value of 69%.
- The demo-call endpoint derives professor authorization from the NextAuth session, validates the number server-side, keeps provider credentials server-only, and applies per-number and global in-memory rate limits.
