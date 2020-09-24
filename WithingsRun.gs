/**
 * Withings API Ref: https://developer.withings.com/oauth2/
 */
var MEASTTYPE_DEF = {
  1: 'Weight (kg)',
  4: 'Height (meter)',
  5: 'Fat Free Mass (kg)',
  6: 'Fat Ratio (%)',
  8: 'Fat Mass Weight (kg)',
  9: 'Diastolic Blood Pressure (mmHg)',
  10: 'Systolic Blood Pressure (mmHg)',
  11: 'Heart Pulse (bpm) - only for BPM and scale devices',
  12: 'Temperature (celsius)',
  54: 'SP02 (%)',
  71: 'Body Temperature (celsius)',
  73: 'Skin Temperature (celsius)',
  76: 'Muscle Mass (kg)',
  77: 'Hydration (kg)',
  88: 'Bone Mass (kg)',
  91: 'Pulse Wave Velocity (m/s)',
  123: 'VO2 max is a numerical measurement of your body’s ability to' +
    'consume oxygen (ml/min/kg).'
}

/**
 * Authorizes and makes a request to the Withings API.
 */
function request(url, payload) {
  var service = getService();
  if (!service.hasAccess()) {
    var authorizationUrl = service.getAuthorizationUrl();
    function errorReport(body) {
      MailApp.sendEmail(EMAIL, 'Custom script error report', body);
    }
    Logger.log('Open the following URL and re-run the script: %s',
        authorizationUrl);
    throw new Error('Open the following URL and re-run the script: ' +
        authorizationUrl);
    return null;
  }
  var options = {
    headers: {
      Authorization: 'Bearer ' + service.getAccessToken()
    },
    payload: payload
  }
  var response = UrlFetchApp.fetch(url, options);
  var result = JSON.parse(response.getContentText());
  if (!('status' in result) || result['status'] != 0){
    throw new Error('Withings API returns wrong status: \n' + result);
  }
  return result;
}

/**
 * Get measures
 */
function getmeas(meastypes='1', duration=2592000) {
  var url = 'https://wbsapi.withings.net/measure';
  var date = new Date() ;
  var enddate = Math.floor(date.getTime() / 1000);
  var startdate = enddate - duration;
  var payload = {
    action: 'getmeas',
    meastypes: meastypes,
    category: 1,
    startdate: startdate,
    enddate: enddate
  }
  var result = request(url, payload);
  measures = {}
  result['body']['measuregrps'].forEach(function(measuregrp) {
    date = measuregrp['date'];
    if (!(date in measures)) {
      measures[date] = {};
    }
    measuregrp['measures'].forEach(function(measure) {
      measures[date][measure['type']] = measure['value'] * (
          10 ** measure['unit']);
    });
  });

  result = Object.keys(measures).map(function(key) {
    return [Number(key), measures[key]];
  });
  result.sort(function(x, y) {
    return x[0] - y[0];
  });

  return result;
}

/**
 * Get height, which is user input and only one input in the past
 * for the most of cases.
 */
function height() {
  var result = getmeas('4', DURATION_HEIGHT);
  if(!result) return;
  var sheet = getSheet('Height', ['Datetime', MEASTTYPE_DEF[4]]);
  var row = sheet.getDataRange().getValues().length + 1;
  var lastrow = sheet.getLastRow();
  var datetimes = sheet.getRange('A:A').getValues().flat().filter(Number);
  var data = [];
  result.forEach(function(measure) {
    if (datetimes.includes(measure[0])) return;
    data.push([measure[0], measure[1][4]]);
  });
  if (data.length) {
    sheet.getRange(row, data.length, 1, 2).setValues(data);
  }
}

/**
 * Get measures of Body Cardio
 */
function body() {
  var types = [1, 5, 6, 8 ,11, 76, 77, 88];
  var result = getmeas(types.join(','), DURATION_BODY);
  if(!result) return;
  var columns = ['Datetime'];
  types.forEach(function(t) {
    columns.push(MEASTTYPE_DEF[t]);
  });
  var sheet = getSheet('Body', columns);
  var row = sheet.getDataRange().getValues().length + 1;
  var lastrow = sheet.getLastRow();
  var datetimes = sheet.getRange('A:A').getValues().flat().filter(Number);
  var data = [];
  result.forEach(function(measure) {
    if (datetimes.includes(measure[0])) return;
    var data_one = [measure[0]];
    types.forEach(function(t) {
      data_one.push(measure[1][t]);
    });
    data.push([data_one]);
  });
  if (data.length) {
    sheet.getRange(row, data.length, 1, columns.length).setValues(data);
  }
}

/**
 * Reset the authorization state, so that it can be re-tested.
 */
function reset() {
  getService().reset();
}

/**
 * Configures the service.
 */
function getService() {
  return OAuth2.createService('Withings')
      // Set the endpoint URLs.
      .setAuthorizationBaseUrl(
          'https://account.withings.com/oauth2_user/authorize2')
      .setTokenUrl('https://account.withings.com/oauth2/token')

      // Set the client ID and secret.
      .setClientId(CLIENT_ID)
      .setClientSecret(CLIENT_SECRET)

      // Set the name of the callback function that should be invoked to
      // complete the OAuth flow.
      .setCallbackFunction('authCallback')

      // Set scope
      .setScope('user.metrics')

      // Set the property store where authorized tokens should be persisted.
      .setPropertyStore(PropertiesService.getUserProperties());
}

/**
 * Handles the OAuth callback.
 */
function authCallback(request) {
  var service = getService();
  var authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Success!');
  } else {
    return HtmlService.createHtmlOutput('Denied.');
  }
}

/**
 * Logs the redict URI to register.
 */
function logRedirectUri() {
  Logger.log(OAuth2.getRedirectUri());
}

/**
 * Spreadsheet Helper
 */
function getSheet(name, cols=[]) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.deleteRows(2, sheet.getMaxRows()-1);
    var nCols = cols ? cols.length: 1;
    sheet.deleteColumns(2, sheet.getMaxColumns()-1);
    cols.forEach(function(c, i) {
      sheet.getRange(1, i+1).setValue(c);
    });
  }
  return sheet;
}
