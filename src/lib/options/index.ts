export {
  parseOptionSymbol,
  OptionParseError,
  type ParsedOption,
} from './parseOptionSymbol';

export { detectSpreads } from './spreadDetection';

export {
  calculateNetCredit,
  calculateMaxLoss,
  calculateBreakeven,
} from './spreadCalculations';

export { detectRollChains } from './rollChain';

export { handleExpiration } from './expirationHandling';

export {
  handlePutAssignment,
  handleShortPutAssignment,
  handleCoveredCallAssignment,
  type PutAssignmentResult,
  type CoveredCallAssignmentResult,
} from './assignmentHandling';

export {
  loadOptionsAccounting,
  type OptionsAccountingSummary,
  type SpreadTrade,
  type OptionLeg,
} from './optionsAccounting';
