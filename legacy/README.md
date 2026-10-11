# Archived PHP backend

This directory preserves the first implementation. **The active HTML5/JavaScript
app does not use it.** Do not serve or deploy it as part of the static site.
It does not support the active app's imported meshes or subtraction.
Its .env configuration does not affect the browser client's API-key input.

- src/: original Project, Config, DeepSeek and Demo, with archive-relative paths.
- api.php: former public endpoint, outside the active web document root.
- COMMANDS.md: archived contract used by its system prompt.
- php-client.js: former browser HTTP adapter.
- tests/run.php and php-http.test.mjs: archived backend checks.
- router.php: exposes /api.php only in the explicit archive test server.

To check preservation of the old backend:

~~~bash
php legacy/tests/run.php
node --import ./tests/register-three.mjs --test legacy/php-http.test.mjs
~~~

Requires PHP 8.1+ with cURL/mbstring and Node 20.6+. Tests disable real API calls.
These checks are separate from npm test, which validates the active app without PHP.
