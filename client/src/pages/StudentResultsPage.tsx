import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { sessionApi } from '../api/client';

export default function StudentResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const participantId = searchParams.get('participantId') || undefined;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !participantId) { setError('Missing participant id'); setLoading(false); return; }
    setLoading(true);
    sessionApi.getResult(sessionId, participantId)
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.data?.error || 'Failed to load results'))
      .finally(() => setLoading(false));
  }, [sessionId, participantId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (error) return <div className="min-h-screen p-8">Error: {error}</div>;

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">Results — {data?.session?.quizTitle}</h1>
      <p className="mt-2">Player: {data.participant.displayName} — Score: {data.participant.finalScore ?? data.participant.score} — Rank: #{data.participant.rank}</p>

      <h2 className="mt-6 text-xl font-semibold">Your Answers</h2>
      <ul className="mt-2 space-y-2">
        {data.responses.map((r: any, idx: number) => (
          <li key={idx} className="p-3 border rounded">Q: {r.questionId} — Answer: {Array.isArray(r.selectedTexts) ? r.selectedTexts.join(', ') : String(r.selectedTexts)} — Correct: {r.isCorrect ? 'Yes' : 'No'} — Points: {r.pointsAwarded}</li>
        ))}
      </ul>

      <h2 className="mt-6 text-xl font-semibold">Leaderboard</h2>
      <ol className="mt-2 list-decimal pl-6">
        {data.leaderboard.slice(0, 10).map((p: any) => (
          <li key={p.id} className={p.id === data.participant.id ? 'font-bold' : ''}>{p.displayName} — {p.finalScore ?? p.score}</li>
        ))}
      </ol>

      <div className="mt-8">
        <Link to="/dashboard" className="text-indigo-600">Back to Dashboard</Link>
      </div>
    </div>
  );
}
