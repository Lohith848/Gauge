# XML adapter follow-up

1. Obtain a real XML battery report from the owner's Windows machine.
2. Put the unsanitized source in `tests/fixtures/real/` (gitignored).
3. Derive the XML schema from that file; do not infer the format from memory.
4. Implement the adapter against the existing normalized `BatteryReport` model.
5. Add a sanitized sample and golden tests before enabling XML intake.
