const completedApiStatuses = new Set([
  'complete', 'completed', 'finished', 'processed', 'ready', 'readyforreview', 'succeeded',
]);
const failedApiStatuses = new Set([
  'cancelled', 'canceled', 'error', 'errored', 'failed', 'failure', 'rejected',
]);

const collectApiStatuses = (value, statuses = [], context = null) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const itemContext = item && typeof item === 'object'
        ? JSON.stringify(item).toLowerCase()
        : context;
      collectApiStatuses(item, statuses, itemContext);
    }
  } else if (value && typeof value === 'object') {
    const statusContext = context || JSON.stringify(value).toLowerCase();
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
      if (
        ['status', 'state', 'jobstatus', 'orderstatus', 'projectstatus', 'processingstatus'].includes(normalizedKey)
        && typeof nested === 'string'
      ) {
        statuses.push({
          value: nested.trim().toLowerCase().replace(/[\s_-]+/g, ''),
          context: statusContext,
        });
      }
      collectApiStatuses(nested, statuses, statusContext);
    }
  }
  return statuses;
};

const processingStatusesFor = (response, body, operation, productInstanceId) => {
  const pathName = new URL(response.url()).pathname.toLowerCase();
  const operationEndpoint = operation === 'Sync'
    ? /\/sync\/jobs(?:\/|$)/i.test(pathName)
    : /\/projects(?:\/|$)/i.test(pathName);
  const triggerRequest = response.request().method() === 'POST';
  const productName = operation === 'Sync' ? /sync[\s_-]*generator/i : /publish/i;
  const instanceId = String(productInstanceId || '').toLowerCase();

  return collectApiStatuses(body).filter((entry) => (
    operationEndpoint
    || triggerRequest
    || !instanceId
    || entry.context.includes(instanceId)
    || productName.test(entry.context)
  ));
};

const waitForProcessingApiResponse = (page, operation, productInstanceId, timeout = 30 * 60_000) => page.waitForResponse(
  async (response) => {
    const urlPattern = operation === 'Sync'
      ? /\/(?:sync\/jobs|orders)(?:\/|[?#]|$)/i
      : /\/(?:orders|projects)(?:\/|[?#]|$)/i;
    if (!urlPattern.test(response.url())) return false;
    if (!response.ok()) return true;
    const body = await response.json().catch(() => null);
    const statuses = processingStatusesFor(response, body, operation, productInstanceId);
    return statuses.some((entry) => (
      completedApiStatuses.has(entry.value) || failedApiStatuses.has(entry.value)
    ));
  },
  { timeout },
);

const assertProcessingCompleted = async (response, operation, productInstanceId) => {
  if (!response.ok()) {
    throw new Error(`${operation} status API failed with HTTP ${response.status()}.`);
  }
  const body = await response.json().catch(() => null);
  const statuses = processingStatusesFor(response, body, operation, productInstanceId);
  const failedStatus = statuses.find((entry) => failedApiStatuses.has(entry.value));
  if (failedStatus) {
    throw new Error(`${operation} processing ended with status "${failedStatus.value}".`);
  }
  if (!statuses.some((entry) => completedApiStatuses.has(entry.value))) {
    throw new Error(`${operation} API response did not report a completed status.`);
  }
};

module.exports = { assertProcessingCompleted, waitForProcessingApiResponse };
