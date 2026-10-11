<?php
// Only used to re-run the archived PHP backend tests; not part of the static app.
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api.php') {
    require __DIR__.'/api.php';
    return true;
}
return false;
