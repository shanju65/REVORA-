"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function Evaluation() {
  const [data, setData] = useState<Record<string, number>>({});
  useEffect(() => { fetch(`${API}/evaluation/metrics`).then((response) => response.json()).then(setData); }, []);
  const cards = [["Precision", `${(data.precision * 100 || 0).toFixed(1)}%`], ["Recall", `${(data.recall * 100 || 0).toFixed(1)}%`], ["F1 score", `${(data.f1 * 100 || 0).toFixed(1)}%`], ["True positives", `${data.true_positives || 0}`], ["False positives", `${data.false_positives || 0}`], ["True negatives", `${data.true_negatives || 0}`], ["False negatives", `${data.false_negatives || 0}`], ["False-positive revenue cost", money(data.false_positive_revenue_cost)]];
  return <section className="panel full-panel"><div className="eyebrow orange">OFFLINE MODEL EVALUATION</div><h3>Ground-truth performance</h3><p className="panel-copy light-copy">Ground-truth labels are used only for offline evaluation and are not provided to the Recovery Agent during decision-making.</p><div className="evaluation-grid">{cards.map(([label, value]) => <div className="evaluation-card" key={label}><span>{label}</span><b>{value}</b></div>)}</div><div className="evaluation-footer"><span>Actual revenue recovered</span><b>{money(data.revenue_recovered)}</b></div></section>;
}
