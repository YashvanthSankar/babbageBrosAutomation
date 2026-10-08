# Disable calls to synthetic roster numbers

- Synthetic roster numbers are no longer sent to OmniDimension from attendance imports or the per-student risk action.
- Clicking **Call student** still checks the session-owned risk record, then explains that no call was placed because the student details are synthetic.
- The professor-entered example call remains the only voice-provider dispatch path. It retains its fixed 69% context, Indian E.164 validation and rate limits.
