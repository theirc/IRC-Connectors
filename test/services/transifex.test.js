const assert = require('assert');
const app = require('../../src/app');

describe('\'Transifex\' service', () => {
  it('registered the service', () => {
    const service = app.service('transifex');

    assert.ok(service, 'Registered the service');
  });
});
