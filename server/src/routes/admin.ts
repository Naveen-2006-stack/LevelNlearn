import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import { triggerEvent } from '../services/pusher.js'; // to broadcast force end
import ExcelJS from 'exceljs';

const router = Router();
router.use(requireAdmin);

// 1. Top-Level Metrics
router.get('/metrics', async (req, res) => {
  try {
    const [[{ totalUsers }]] = await pool.query<any>('SELECT COUNT(*) AS totalUsers FROM User');
    const [[{ activeSessions }]] = await pool.query<any>("SELECT COUNT(*) AS activeSessions FROM LiveSession WHERE status = 'ACTIVE'");
    const [[{ totalQuizzes }]] = await pool.query<any>('SELECT COUNT(*) AS totalQuizzes FROM Quiz');
    
    res.json({
      totalUsers: Number(totalUsers),
      activeSessions: Number(activeSessions),
      totalQuizzes: Number(totalQuizzes)
    });
  } catch (error) {
    console.error('Error fetching admin metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// 2. User Management
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query<any>('SELECT id, name, email, regNo, role, isGhost FROM User ORDER BY emailVerified DESC, id DESC LIMIT 100');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user?.userId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    await pool.query('DELETE FROM User WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.patch('/users/:id/ghost', async (req, res) => {
  try {
    const { id } = req.params;
    const { isGhost } = req.body;
    await pool.query('UPDATE User SET isGhost = ? WHERE id = ?', [isGhost ? 1 : 0, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle ghost mode' });
  }
});

// 3. Session Management
router.get('/sessions', async (req, res) => {
  try {
    const [sessions] = await pool.query<any>(`
      SELECT ls.id, ls.joinCode, ls.status, ls.startedAt, ls.finishedAt,
             q.title as quizTitle, u.name as hostName
      FROM LiveSession ls
      JOIN Quiz q ON ls.quizId = q.id
      JOIN User u ON ls.teacherId = u.id
      ORDER BY ls.startedAt DESC, ls.id DESC
      LIMIT 100
    `);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM LiveSession WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

router.post('/sessions/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE LiveSession SET status = 'FINISHED', finishedAt = NOW() WHERE id = ?", [id]);
    
    // Notify clients to disconnect or show finished screen
    try {
      await triggerEvent(`session-${id}`, 'session-finished', { forceEnded: true });
    } catch (e) {
      console.warn('Failed to trigger Pusher event for session force-end', e);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to force end session' });
  }
});

// 4. Feedback Management
router.get('/feedback', async (req, res) => {
  try {
    const [feedbacks] = await pool.query<any>(`
      SELECT f.id, f.rating, f.message, f.createdAt, u.name, u.email 
      FROM Feedback f
      JOIN User u ON f.userId = u.id
      ORDER BY f.createdAt DESC
    `);
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

router.delete('/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM Feedback WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete feedback' });
  }
});

// GET /api/admin/sessions/:id/report.xlsx — admin export full analytics as Excel for any session
router.get('/sessions/:id/report.xlsx', async (req, res) => {
  try {
    const { id } = req.params;
    const [sessionRows] = await pool.query<any[]>(
      'SELECT ls.*, q.title AS quizTitle FROM LiveSession ls JOIN Quiz q ON q.id = ls.quizId WHERE ls.id = ? AND ls.deletedAt IS NULL',
      [id]
    );
    if ((sessionRows as any[]).length === 0) { res.status(404).send('Session not found'); return; }
    const session = (sessionRows as any[])[0];

    const [[participants], [responses], [questions], [violations]] = await Promise.all([
      pool.query<any[]>('SELECT * FROM Participant WHERE sessionId = ?', [id]),
      pool.query<any[]>('SELECT * FROM StudentResponse WHERE sessionId = ?', [id]),
      pool.query<any[]>('SELECT id, questionText, orderIndex, options FROM Question WHERE quizId = ? ORDER BY orderIndex ASC', [session.quizId]),
      pool.query<any[]>('SELECT * FROM Violation WHERE sessionId = ? ORDER BY createdAt DESC', [id]),
    ]);

    const pRows = participants as any[];
    const rRows = responses as any[];
    const qRows = questions as any[];
    const vRows = violations as any[];

    const displayNames = pRows.map(p => p.displayName);
    let usersMap: Record<string, any> = {};
    if (displayNames.length > 0) {
      const placeholders = displayNames.map(() => '?').join(',');
      const [userRows] = await pool.query<any[]>(
        `SELECT name, email, regNo FROM User WHERE name IN (${placeholders})`,
        displayNames
      );
      for (const u of userRows as any[]) { usersMap[u.name] = u; }
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LevelNLearn';
    workbook.created = new Date();

    function styleHeaderAndFreeze(sheet: ExcelJS.Worksheet, headerFillColor = 'FFEEF2FF') {
      const header = sheet.getRow(1);
      header.font = { bold: true } as any;
      header.alignment = { vertical: 'middle', horizontal: 'left' } as any;
      header.height = 22;
      header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFillColor } } as any;
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as any;
      });
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    function autofitColumns(sheet: ExcelJS.Worksheet) {
      sheet.columns!.forEach((col) => {
        let maxLength = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const val = cell.value;
          let text = '';
          if (val === null || val === undefined) text = '';
          else if (typeof val === 'string') text = val;
          else if (typeof val === 'number') text = String(val);
          else if (val instanceof Date) text = val.toLocaleString();
          else text = JSON.stringify(val).slice(0, 200);
          maxLength = Math.max(maxLength, Math.min(50, text.length + 2));
        });
        col.width = maxLength;
      });
    }

    // --- Summary ---
    const summarySheet = workbook.addWorksheet('Summary');
    const totalParticipants = pRows.length;
    const scores = pRows.map(p => Number(p.score) || 0);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;
    const lowestScore = scores.length ? Math.min(...scores) : 0;

    summarySheet.columns = [ { header: 'Metric', key: 'metric', width: 25 }, { header: 'Value', key: 'value', width: 40 } ];
    summarySheet.addRows([
      { metric: 'Quiz Title', value: session.quizTitle },
      { metric: 'Date', value: session.startedAt ? new Date(session.startedAt).toLocaleString() : 'N/A' },
      { metric: 'Total Participants', value: totalParticipants },
      { metric: 'Average Score', value: avgScore.toFixed(2) },
      { metric: 'Highest Score', value: highestScore },
      { metric: 'Lowest Score', value: lowestScore },
    ]);
    styleHeaderAndFreeze(summarySheet, 'FFDDEEF8');
    autofitColumns(summarySheet);

    // --- Participants ---
    const participantsSheet = workbook.addWorksheet('Participants');
    participantsSheet.columns = [
      { header: 'Name', key: 'name', width: 20 }, { header: 'Reg No', key: 'regNo', width: 15 },
      { header: 'Email', key: 'email', width: 25 }, { header: 'Score', key: 'score', width: 10 },
      { header: 'Correct/Total', key: 'correctTotal', width: 15 }, { header: 'Violations', key: 'violations', width: 12 },
      { header: 'Violation Details', key: 'violationDetails', width: 50 },
    ];

    for (const p of pRows) {
      const pRes = rRows.filter(r => r.participantId === p.id);
      const correctCount = pRes.filter(r => r.isCorrect).length;
      const pViolations = vRows.filter(v => v.participantId === p.id);
      const violationCount = pViolations.length;
      const violationDetails = pViolations.map(v => v.violationType).join(', ');
      const matchedUser = usersMap[p.displayName] || {};

      participantsSheet.addRow({ name: p.displayName, regNo: matchedUser.regNo || 'N/A', email: matchedUser.email || 'N/A', score: p.score, correctTotal: `${correctCount} / ${qRows.length}`, violations: violationCount, violationDetails });
    }
    styleHeaderAndFreeze(participantsSheet, 'FFF6F9E9');
    autofitColumns(participantsSheet);

    // --- Question Analysis ---
    const qAnalysisSheet = workbook.addWorksheet('Question Analysis');
    qAnalysisSheet.columns = [ { header: 'Q#', key: 'qNum', width: 5 }, { header: 'Question Text', key: 'qText', width: 50 }, { header: '% Correct', key: 'pctCorrect', width: 12 }, { header: 'Most Picked Wrong Answer', key: 'wrongAnswer', width: 40 } ];

    for (const q of qRows) {
      const qRes = rRows.filter(r => r.questionId === q.id);
      const attempts = qRes.length;
      const correctCount = qRes.filter(r => r.isCorrect).length;
      const pctCorrect = attempts > 0 ? ((correctCount / attempts) * 100).toFixed(2) + '%' : '0%';
      const wrongRes = qRes.filter(r => !r.isCorrect);
      const wrongMap: Record<string, number> = {};
      for (const r of wrongRes) {
        const selected = r.selectedTexts ? JSON.parse(r.selectedTexts).join(', ') : 'No Answer';
        wrongMap[selected] = (wrongMap[selected] || 0) + 1;
      }
      let mostPickedWrong = 'N/A'; let maxWrong = 0;
      for (const [ans, count] of Object.entries(wrongMap)) { if (count > maxWrong) { maxWrong = count; mostPickedWrong = ans; } }
      qAnalysisSheet.addRow({ qNum: q.orderIndex + 1, qText: q.questionText, pctCorrect: pctCorrect, wrongAnswer: mostPickedWrong !== 'N/A' ? `${mostPickedWrong} (${maxWrong})` : 'None' });
    }
    styleHeaderAndFreeze(qAnalysisSheet, 'FFF0F7FF'); autofitColumns(qAnalysisSheet);

    // --- Raw Responses ---
    const rawSheet = workbook.addWorksheet('Raw Responses');
    rawSheet.columns = [ { header: 'Participant', key: 'participant', width: 20 }, { header: 'Q#', key: 'qNum', width: 5 }, { header: 'Question Text', key: 'qText', width: 40 }, { header: 'Answer Given', key: 'answer', width: 30 }, { header: 'Is Correct', key: 'isCorrect', width: 12 }, { header: 'Points Awarded', key: 'points', width: 15 } ];

    for (const r of rRows) {
      const p = pRows.find(x => x.id === r.participantId);
      const q = qRows.find(x => x.id === r.questionId);
      if (!p || !q) continue;
      let selected = '';
      try { selected = r.selectedTexts ? JSON.parse(r.selectedTexts).join(', ') : ''; } catch (e) { selected = r.selectedTexts; }
      rawSheet.addRow({ participant: p.displayName, qNum: q.orderIndex + 1, qText: q.questionText, answer: selected, isCorrect: r.isCorrect ? 'Yes' : 'No', points: r.pointsAwarded || 0 });
    }
    styleHeaderAndFreeze(rawSheet, 'FFFFFFFF'); autofitColumns(rawSheet);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=session-${id}-report.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[Admin Report] error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
