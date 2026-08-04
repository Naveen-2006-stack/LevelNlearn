import { test, expect, request } from '@playwright/test';

test('teacher host and student join-answer-finish flow', async ({ browser, baseURL }) => {
  const teacherEmail = process.env.E2E_TEACHER_EMAIL;
  const teacherPassword = process.env.E2E_TEACHER_PASSWORD;
  const studentEmail = process.env.E2E_STUDENT_EMAIL;
  const studentPassword = process.env.E2E_STUDENT_PASSWORD;
  const quizId = process.env.E2E_QUIZ_ID;
  const apiURL = process.env.E2E_API_URL || 'http://localhost:4000';

  test.skip(!teacherEmail || !teacherPassword || !studentEmail || !studentPassword || !quizId, 'Missing E2E env vars');

  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();

  await teacherPage.goto(`${baseURL}/login`);
  await teacherPage.getByLabel('Email').fill(String(teacherEmail));
  await teacherPage.getByLabel('Password').fill(String(teacherPassword));
  await teacherPage.getByRole('button', { name: 'Sign In' }).click();
  await expect(teacherPage).toHaveURL(/\/dashboard/);

  const teacherToken = await teacherPage.evaluate(() => {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.state?.token || null;
    } catch {
      return null;
    }
  });
  expect(teacherToken).toBeTruthy();

  const api = await request.newContext({
    baseURL: apiURL,
    extraHTTPHeaders: { Authorization: `Bearer ${teacherToken}` },
  });

  const createRes = await api.post('/api/sessions', { data: { quizId, mode: 'UNANIMOUS' } });
  expect(createRes.ok()).toBeTruthy();
  const createBody = await createRes.json();
  const sessionId: string = createBody.id;
  const joinCode: string = createBody.joinCode;

  await teacherPage.goto(`${baseURL}/host/${sessionId}`);
  await expect(teacherPage.getByText('Game PIN')).toBeVisible();
  await expect(teacherPage.getByText(joinCode)).toBeVisible();

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();

  await studentPage.goto(`${baseURL}/login`);
  await studentPage.getByLabel('Email').fill(String(studentEmail));
  await studentPage.getByLabel('Password').fill(String(studentPassword));
  await studentPage.getByRole('button', { name: 'Sign In' }).click();
  await expect(studentPage).toHaveURL(/\/dashboard/);

  await studentPage.goto(`${baseURL}/join?code=${encodeURIComponent(joinCode)}`);
  await studentPage.getByRole('button', { name: 'Enter' }).click();
  await studentPage.getByRole('button', { name: 'I understand, start quiz' }).click();
  await expect(studentPage).toHaveURL(new RegExp(`/play/${sessionId}`));

  await teacherPage.getByRole('button', { name: /Start Game/i }).click();

  const optionButtons = studentPage.locator('main button').filter({ hasText: /.+/ });
  await optionButtons.first().click();
  await studentPage.getByRole('button', { name: /Confirm/i }).click();

  await teacherPage.getByRole('button', { name: /End Game|Next Question/i }).click();
  await expect(teacherPage.getByText('Final Standings')).toBeVisible({ timeout: 30_000 });

  await teacherContext.close();
  await studentContext.close();
  await api.dispose();
});
