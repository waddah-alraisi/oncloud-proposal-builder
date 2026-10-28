// The app's screens, declared the way OnCloud declares its own (the shell's manifest format, checked by the same
// validator). The proposals list is OnCloud's own list over /api/v1/connected/data/proposal; a proposal opens in the
// builder, this app's `kind: "app"` screen (src/views/builder.js). Data: schema/proposal-builder.schema.json.
import { both as L } from './i18n.js';

const ro = { readOnly: true };
const STATUS_TONES = { draft: 'gray', awaiting: 'blue', active: 'amber', won: 'green', lost: 'red' };

export function proposalManifest() {
  return {
    version: 1,
    app: { name: L('title'), basePath: '/', apiBase: '/api/v1/connected', defaultRoute: '/proposals', notFound: 'pb.notfound', forbidden: 'pb.notfound', locales: ['en', 'ar'], defaultLocale: 'en' },
    theme: {},
    sidebar: { brand: { route: '/proposals' } },
    shape: { topbar: true, sidebar: { base: 'drawer', lg: 'fixed' }, content: { mode: true, padding: { base: 'sm', sm: 'lg' } }, bottombar: { base: true, lg: false } },
    resources: {
      pb_proposal: {
        endpoint: '/data/proposal', key: 'id', label: L('proposals'), titleField: 'client', permission: 'proposals.proposal',
        fields: {
          id: { type: 'string', column: 'id', ...ro, label: L('id') },
          ref: { type: 'string', column: 'ref', ...ro, label: L('ref') },
          client: { type: 'string', column: 'client', ...ro, label: L('client') },
          status: {
            type: 'enum', column: 'status', ...ro, label: L('status'), query: { filterable: true },
            options: Object.entries(STATUS_TONES).map(([value, tone]) => ({ value, label: L(`st.${value}`), tone })),
          },
          currency: { type: 'string', column: 'currency', ...ro, label: L('currency') },
          year_one: { type: 'decimal', column: 'year_one', ...ro, label: L('yearOne') },
          valid: { type: 'date', column: 'valid', ...ro, label: L('valid') },
          prepared_by: { type: 'string', column: 'prepared_by', ...ro, label: L('preparedBy') },
          quote_number: { type: 'string', column: 'quote_number', ...ro, label: L('quote') },
          created_at: { type: 'date', column: 'created_at', ...ro, query: { sortable: true }, label: L('added') },
        },
      },
    },
    screens: {
      'pb.notfound': { kind: 'message', title: L('notFound'), body: L('pageNotFoundBody') },
      'pb.proposals': {
        kind: 'list', resource: 'pb_proposal', title: L('proposals'),
        columns: ['client', 'ref', 'status', 'currency', 'year_one', 'valid', 'quote_number', 'prepared_by', 'created_at'],
        search: true, perPage: 25, filters: ['status'], defaultSort: { field: 'created_at', dir: 'desc' },
        rowClick: 'pb.proposal.open', rowActions: ['pb.proposal.open'], toolbarActions: ['pb.proposal.create'],
        empty: { title: L('noProposals'), body: L('noProposalsBody') },
      },
      'pb.proposal.new': { kind: 'app', component: 'pb.new', title: L('newProposal') },
      'pb.proposal.builder': { kind: 'app', component: 'pb.builder', title: L('proposals') },
    },
    routes: [
      { path: '/proposals', screen: 'pb.proposals', keepAlive: true },
      { path: '/proposals/new', screen: 'pb.proposal.new' },
      { path: '/proposals/:id', screen: 'pb.proposal.builder' },
    ],
    menu: [
      { id: 'pb_sales', label: L('sales'), icon: 'file', order: 1, items: [
        { key: 'pb.proposals', label: L('proposals'), route: '/proposals', icon: 'file', order: 10 },
        { key: 'pb.proposal.new', label: L('newProposal'), route: '/proposals/new', icon: 'plus', order: 20 },
      ] },
    ],
    overlays: {},
    actions: {
      'pb.proposal.open': { kind: 'navigate', to: '/proposals/:id', label: L('open') },
      'pb.proposal.create': { kind: 'navigate', to: '/proposals/new', label: L('newProposal'), icon: 'plus', variant: 'primary' },
    },
  };
}
