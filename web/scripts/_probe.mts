import { getSeedManifest } from '../lib/data/registry';
import { getHomeBundle } from '../lib/data/home';
import { getTeamBundle } from '../lib/data/team';
import { getPlayerPopulation, getPlayerBundle } from '../lib/data/player';
import { getCompareBundle } from '../lib/data/compare';

async function main(){
const m = await getSeedManifest();
console.log('=== MANIFEST ===');
for (const [k,v] of m) console.log(k.padEnd(30), v.status, v.rowCount);

const home = await getHomeBundle('afc-east');
console.log('=== HOME season', home.season, 'capplusCovered', home.leaderboard.capplusCovered);
console.log('division teams:', JSON.stringify(home.division.teams.map(t=>({t:t.team,cpw:t.costPerWin.state==='value'?t.costPerWin.value.perWin:t.costPerWin.state, idx:t.index.state==='value'?t.index.value:t.index.state})),null,0));
console.log('lb rows', home.leaderboard.rows.length, JSON.stringify(home.leaderboard.rows.slice(0,3)));
console.log('ledger', home.ledger.state, home.ledger.state==='value'?home.ledger.value.length:0);

const ne = await getTeamBundle('NE', 2007);
console.log('=== NE 2007 ===', ne ? Object.keys(ne).join(',') : 'null');
if (ne) {
  console.log('index', ne.index.name, JSON.stringify(ne.index.metric).slice(0,200));
  console.log('history points', ne.history.points.length, JSON.stringify(ne.history.points.slice(0,2)));
  console.log('lenses', JSON.stringify(ne.lenses));
  console.log('alloc', ne.allocation.state);
  console.log('cpw', JSON.stringify(ne.costPerWin));
  console.log('stability', ne.stability.state, 'track', ne.stabilityTrack.length, 'regimes', ne.regimes.length);
  console.log('dm', JSON.stringify(ne.deadMoney.resolved).slice(0,200), 'series', ne.deadMoney.series.length, 'ledger', ne.deadMoney.ledger.length);
  console.log('draft', ne.draft.summary.state, ne.draft.picks.length);
  console.log('results', JSON.stringify(ne.results));
}
const no = await getTeamBundle('NO', 2021);
if (no) { console.log('=== NO 2021 === idx', no.index.name, JSON.stringify(no.index.metric).slice(0,180), 'alloc', no.allocation.state, 'cpw', JSON.stringify(no.costPerWin), 'dm', JSON.stringify(no.deadMoney.resolved).slice(0,200)); }
const kc = await getTeamBundle('KC', 2024);
if (kc) { console.log('=== KC 2024 === idx', kc.index.name, JSON.stringify(kc.index.metric).slice(0,300), 'alloc', kc.allocation.state===('value')? JSON.stringify(kc.allocation.value): kc.allocation.state); console.log('KC dm series', JSON.stringify(kc.deadMoney.series.slice(0,3)), 'regimes', JSON.stringify(kc.regimes.slice(0,1))); console.log('KC stability', JSON.stringify(kc.stability).slice(0,300)); }

const pop = await getPlayerPopulation();
console.log('=== POP ===', pop.length, JSON.stringify(pop.slice(0,3)));
const pb = await getPlayerBundle(pop[0].playerId);
console.log('=== PLAYER', pop[0].playerId, JSON.stringify(pb).slice(0,1200));

const cmp = await getCompareBundle({team:'BUF',season:2007},{team:'KC',season:2024});
console.log('=== COMPARE ===', JSON.stringify(cmp?.rows.map(r=>({k:r.key,tier:r.tier,a:r.a.raw.state,b:r.b.raw.state, aAvg:r.a.leagueAvg, aDelta:r.a.delta})),null,0));
process.exit(0);
}
main();
