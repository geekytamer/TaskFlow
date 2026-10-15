// Loaded before every test file (see the "test" script).
//
// listen(0) binds the IPv6 wildcard, but supertest always dials 127.0.0.1.
// macOS can hand that wildcard socket a port some other process already holds
// on 127.0.0.1 specifically (editor helpers, local model servers), and then
// that process answers the test's request: "Parse Error: Expected HTTP/",
// socket hang ups, or someone else's JSON. Dial the address actually bound.
const { Test } = require('supertest');

const serverAddress = Test.prototype.serverAddress;
Test.prototype.serverAddress = function (app, path) {
  const url = serverAddress.call(this, app, path);
  return app.address()?.address === '::' ? url.replace('://127.0.0.1:', '://[::1]:') : url;
};

// Quiet hours (22:00-08:00) would hold pushes whenever the suite happens to run at night.
// push-quiet-hours.test.js turns them back on and passes explicit times.
process.env.TASKFLOW_QUIET_HOURS ??= 'off';
