// The code behind the manifest's `kind: "app"` screens (src/manifest.js), by component name.
import { appScreen } from './host.js';
import { builderView, fromQuoteView, newProposalView } from '../views/builder.js';

export const COMPONENTS = {
  'pb.builder': appScreen(builderView),
  'pb.new': appScreen(newProposalView),
  'pb.fromQuote': appScreen(fromQuoteView),
};
