import { parseArtifact, Evidence } from './agent-contract';

const evidence: Evidence[] = [{ key:'task:real', title:'Open task', href:'/tasks', detail:'Overdue' }];
const valid = { title:'Improve completion', rationale:'Address an overdue task', dueDate:'2027-02-28',
  target:90, baseline:75, metric:'On-time completion', unit:'%', evidenceKeys:['task:real'], tasks:['Measure current completion'] };
const run = (goal: unknown) => parseArtifact(JSON.stringify({summary:'Plan based on task:real', goals:[goal]}),evidence,'goals','2026-11-17');

describe('agent artifact boundary', () => {
  it('accepts real citations and never treats an AI-supplied baseline as measured', () => {
    expect(run(valid).goals[0]).toEqual(expect.objectContaining({baseline:null,evidenceKeys:['task:real'],target:90}));
  });
  it.each([{evidenceKeys:['private:other-company']},{dueDate:'2027-02-31'},{dueDate:'2026-11-16'},{target:'90'},{tasks:['a','b','c','d']}])('rejects invalid or unsupported goal changes %j', fields => {
    expect(() => run({...valid,...fields})).toThrow();
  });
  it('does not convert goals in an analysis response into executable proposals', () => {
    expect(parseArtifact(JSON.stringify({summary:'Analysis',goals:[valid]}),evidence,'analysis').goals).toEqual([]);
  });
});

describe('agent recommendations', () => {
  const analysis = (body: unknown) => parseArtifact(JSON.stringify(body), evidence, 'analysis');

  it('keeps ranked recommendations and drops citations the agent was not given', () => {
    const artifact = analysis({
      summary: 'Costs rose [task:real]',
      recommendations: [
        { title: 'Cut hotel spend', rationale: 'Hotels are the largest cost line', expectedImpact: 'About 800 USD a quarter (estimate)',
          impact: 'high', effort: 'low', timeframe: '2 weeks', firstSteps: ['Set a travel policy'], evidenceKeys: ['task:real', 'invented:key'] },
        { title: '', rationale: 'no title' },
        'not an object',
      ],
      dataGaps: ['No cost of goods sold recorded'],
    });
    expect(artifact.recommendations).toHaveLength(1);
    expect(artifact.recommendations?.[0]).toMatchObject({ title: 'Cut hotel spend', impact: 'high', effort: 'low', evidenceKeys: ['task:real'] });
    expect(artifact.dataGaps).toEqual(['No cost of goods sold recorded']);
  });

  it('defaults unknown levels and tolerates a missing recommendations list', () => {
    const artifact = analysis({ summary: 'Brief', recommendations: [{ title: 'A', rationale: 'B', impact: 'huge' }] });
    expect(artifact.recommendations?.[0]).toMatchObject({ impact: 'medium', effort: 'medium', expectedImpact: 'Not estimated' });
    expect(analysis({ summary: 'Brief' }).recommendations).toEqual([]);
  });
});
