export interface MetricDataPoint {
  date: string;
  value: number;
}

export interface MetricSummary {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

export interface FounderDashboard {
  focusAreas: FocusArea[];
  kpis: KpiMetric[];
  weeklyGoalProgress: number;
  teamProductivity: MetricSummary;
  openRisks: Risk[];
  topOpportunities: Opportunity[];
  aiInsights: string[];
}

export interface FocusArea {
  id: string;
  title: string;
  priority: number;
  reason: string;
  relatedTasks: string[];
}

export interface KpiMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  target?: number;
  summary: MetricSummary;
  history: MetricDataPoint[];
}

export interface Risk {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

export interface Opportunity {
  id: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  description: string;
  nextStep: string;
}

export interface BusinessMetrics {
  revenue: MetricSummary & { history: MetricDataPoint[] };
  expenses: MetricSummary & { history: MetricDataPoint[] };
  profit: MetricSummary & { history: MetricDataPoint[] };
  churnRate: MetricSummary;
  growthRate: MetricSummary;
  customerHealth: MetricSummary;
  userProductivity: MetricSummary;
}
