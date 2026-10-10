import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const required = [
  'README.md','AGENTS.md','docs/spec/MVP-v1.2.md',
  'docs/architecture/ARCHITECTURE.md','docs/decisions/ADR-001-stack.md',
  'docs/decisions/ADR-002-money-authority.md','docs/decisions/OPEN_ITEMS.md',
  'docs/contracts/API_CONTRACT.md','docs/contracts/openapi.yaml',
  'docs/plans/MASTER_PLAN.md','docs/plans/BACKEND_PLAN.md',
  'docs/plans/WEB_PLAN.md','docs/plans/MOBILE_PLAN.md',
  'docs/plans/PARALLEL_EXECUTION.md','docs/agents/AGENT_WORKFLOW.md',
  'docs/qa/ACCEPTANCE.md','docs/ops/RUNBOOK.md',
  '.github/workflows/docs-ci.yml'
];
const skillRoot = join(root,'.agents/skills');
for (const d of readdirSync(skillRoot,{withFileTypes:true}).filter(d=>d.isDirectory())) required.push(`.agents/skills/${d.name}/SKILL.md`);
const missing = required.filter(p=>!existsSync(join(root,p)));
if(missing.length) throw new Error(`Missing required planning files: ${missing.join(', ')}`);
const spec = readFileSync(join(root,'docs/spec/MVP-v1.2.md'),'utf8');
for(const word of ['requested_payment_method','hai liên','Không quản lý số lượng tồn kho']) {
  if(!spec.includes(word)) throw new Error(`Spec invariant missing: ${word}`);
}
const readme=readFileSync(join(root,'README.md'),'utf8');
if(!readme.includes('SPEC/PLAN BASELINE ONLY')) throw new Error('README must reflect non-implemented status');
const bad = required.filter(p=>readFileSync(join(root,p),'utf8').trim().length===0);
if(bad.length) throw new Error(`Empty mandatory documents: ${bad.join(', ')}`);
console.log(`Planning pack OK: ${required.length} required files; docs-only validation, NOT app CI.`);
