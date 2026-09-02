---
name: Password reset environment boundary
description: Why password-reset links must remain in the environment that issued their token.
---

Password-reset links must point to the same environment whose database stores the token. Preview and production tokens are not interchangeable.

**Why:** A hardcoded production reset URL caused newly issued Preview tokens to be rejected as invalid. Environment-aware links restored the complete reset flow, as confirmed by a successful user reset.

**How to apply:** Preserve environment-aware reset-link generation whenever authentication email delivery or deployment URL handling changes. Do not use a production URL for tokens issued in Preview.