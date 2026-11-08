const CONFIG = {
  sheetName: 'WebhookLog',
  notificationRules: [
    {
      deviceName: '玄関開閉センサー',
      deviceMacProperty: 'CONTACT_SENSOR_MAC',
      statusField: 'openState',
      statusValue: 'open',
    },
    {
      deviceName: '玄関ロック',
      deviceMacProperty: 'LOCK_28_MAC',
      statusField: 'lockState',
      statusValue: 'LOCKED',
    },
  ],
};

function doPost(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') {
    throw new Error('Webhook request did not contain a POST body.');
  }

  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = requireScriptProperty_(properties, 'SPREADSHEET_ID');
  const notificationEmail = requireScriptProperty_(properties, 'NOTIFICATION_EMAIL');
  const notificationRules = CONFIG.notificationRules.map(function (rule) {
    return {
      deviceName: rule.deviceName,
      deviceMac: requireScriptProperty_(properties, rule.deviceMacProperty),
      statusField: rule.statusField,
      statusValue: rule.statusValue,
    };
  });

  const rawBody = e.postData.contents;
  appendWebhookBody_(rawBody, spreadsheetId);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    console.warn('Webhook body was stored, but is not valid JSON.');
    return textResponse_('Stored; invalid JSON, notification skipped.');
  }

  const matchedRule = findMatchingNotificationRule_(event, notificationRules);
  if (matchedRule) {
    MailApp.sendEmail({
      to: notificationEmail,
      subject: matchedRule.deviceName + ' ' + matchedRule.statusValue,
      body: '',
    });
  }

  return textResponse_('OK');
}

function requireScriptProperty_(properties, key) {
  const value = properties.getProperty(key);
  if (!value) {
    throw new Error('Missing required GAS Script Property: ' + key);
  }
  return value;
}

function appendWebhookBody_(rawBody, spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, 2).setValues([[new Date(), rawBody]]);
  } finally {
    lock.releaseLock();
  }
}

function findMatchingNotificationRule_(event, notificationRules) {
  const context = event && event.context;
  if (!context || typeof context !== 'object') {
    return null;
  }

  const deviceMac = normalizeDeviceMac_(context.deviceMac);
  if (!deviceMac) {
    return null;
  }

  return notificationRules.find(function (rule) {
    const statusValue = context[rule.statusField];
    return normalizeDeviceMac_(rule.deviceMac) === deviceMac &&
      statusValue !== undefined &&
      String(statusValue).toUpperCase() === String(rule.statusValue).toUpperCase();
  }) || null;
}

function normalizeDeviceMac_(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/[:-]/g, '').toUpperCase();
}

function textResponse_(message) {
  return ContentService.createTextOutput(message)
    .setMimeType(ContentService.MimeType.TEXT);
}
