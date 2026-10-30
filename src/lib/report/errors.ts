import type { ParseError, ParseErrorCode } from './types';
const COPY: Record<ParseErrorCode, [string, string]> = {
  E_EMPTY: ['This file is empty.', 'Choose a Windows battery report saved as an HTML file.'],
  E_TOO_LARGE: ['This file is larger than 10 MB.', 'Choose a smaller battery report file.'],
  E_UNSUPPORTED_TYPE: ['This is not a Windows battery report.', 'Choose the HTML file created by powercfg /batteryreport.'],
  E_UNSUPPORTED_FORMAT: ['XML battery reports are not supported yet.', 'Generate an HTML report with powercfg /batteryreport.'],
  E_NOT_BATTERY_REPORT: ['This is not a Windows battery report.', 'Choose the HTML file created by powercfg /batteryreport.'],
  E_NO_BATTERY: ['Windows did not find a battery in this report.', 'Check that your device has a battery and generate a new report.'],
  E_DATE_FORMAT: ['Some report dates could not be read.', 'Generate a new report in Windows and try again.'],
  E_NO_DATA: ['This report does not contain enough battery data.', 'Generate a new report with powercfg /batteryreport.'],
};
export function makeParseError(code: ParseErrorCode): ParseError {
  const [message, hint] = COPY[code]; return { code, message, hint };
}
