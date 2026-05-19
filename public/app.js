const API = ''; // same origin
let adminSession = JSON.parse(localStorage.getItem('adminSession')) || null;
let quizState    = null;
let timerInterval = null;
let schools = [];

// ── NAVIGATION ────────────────────────────────────────────────────────────────

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function switchTab(tab) {
  document.getElementById('admin-tab-tests').classList.toggle('hidden', tab !== 'tests');
  document.getElementById('admin-tab-results').classList.toggle('hidden', tab !== 'results');
  document.getElementById('tab-tests').classList.toggle('active', tab === 'tests');
  document.getElementById('tab-results').classList.toggle('active', tab !== 'tests');
  if (tab === 'results') loadResults();
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  return r.json();
}

function escapeHtml(str) {
  if (str == null) return '';

  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = `<div class="alert alert-error">⚠ ${msg}</div>`;
}
function clearError(elId) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = '';
}
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function formatDuration(secs) {
  if (!secs) return '-';
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
}
function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('sq-AL');
}

// ── SCHOOLS ───────────────────────────────────────────────────────────────────

async function loadSchools() {
  schools = await api('/api/schools');
  const sel = document.getElementById('s-school');
  sel.innerHTML = '<option value="">Zgjidh shkollën</option>';
  schools.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    sel.appendChild(o);
  });
}
loadSchools();

// ── STUDENT FLOW ──────────────────────────────────────────────────────────────

async function studentLogin() {
  clearError('student-login-error');
  const name    = document.getElementById('s-name').value.trim();
  const surname = document.getElementById('s-surname').value.trim();
  const grade   = document.getElementById('s-grade').value;
  const school  = document.getElementById('s-school').value;
  const code    = document.getElementById('s-test-code').value.trim().toUpperCase();

  if (!name || !surname || !grade || !school || !code)
    return showError('student-login-error', 'Plotëso të gjitha fushat!');

  try {
    const data = await api('/api/session/start', 'POST', { name, surname, grade, school, test_code: code });
    if (data.error) return showError('student-login-error', data.error);
    startQuiz(data);
  } catch (e) {
    showError('student-login-error', 'Gabim lidhjeje. Provo sërish.');
  }
}

function startQuiz(data) {
  quizState = {
    session_id: data.session_id,
    questions:  data.questions,
    answers:    {},
    current:    0,
    remaining:  data.duration_seconds,
    subject:    data.subject
  };
  document.getElementById('quiz-subject-header').textContent = data.subject;
  document.getElementById('quiz-student-header').textContent =
    document.getElementById('s-name').value + ' ' + document.getElementById('s-surname').value;

  renderQuestion(0);
  buildQuestionNav();
  startTimer();
  showPage('page-quiz');
}

function buildQuestionNav() {
  const nav = document.getElementById('question-nav');
  nav.innerHTML = '';
  quizState.questions.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'q-dot' + (i === 0 ? ' current' : '');
    d.textContent = i + 1;
    d.id = `qdot-${i}`;
    d.onclick = () => goToQuestion(i);
    nav.appendChild(d);
  });
}

function updateQuestionNav() {
  quizState.questions.forEach((q, i) => {
    const d = document.getElementById(`qdot-${i}`);
    if (!d) return;
    d.className = 'q-dot';
    if (quizState.answers[i] !== undefined) d.classList.add('answered');
    if (i === quizState.current)             d.classList.add('current');
  });
  const answered = Object.keys(quizState.answers).length;
  const total    = quizState.questions.length;
  document.getElementById('quiz-progress-badge').textContent = `${answered}/${total}`;
  document.getElementById('quiz-progress-fill').style.width  = `${(answered / total) * 100}%`;
}

function renderQuestion(idx) {
  const q       = quizState.questions[idx];
  const saved   = quizState.answers[idx];
  const letters = ['A', 'B', 'C', 'D'];

  let html = `<div class="question-card">
    <div class="text-muted text-sm mb-1">Pyetja ${idx + 1} nga ${quizState.questions.length}</div>
    <div class="question-text">${q.question}</div>`;

  q.options.forEach((opt, oi) => {
    const sel = saved === oi ? ' selected' : '';
    html += `<button class="option-btn${sel}" onclick="selectAnswer(${idx},${oi})">
      <span class="option-letter">${letters[oi]}</span>${opt}
    </button>`;
  });
  html += `</div>`;

  document.getElementById('question-container').innerHTML = html;
  document.getElementById('btn-prev').disabled    = idx === 0;
  const isLast = idx === quizState.questions.length - 1;
  document.getElementById('btn-next').textContent = isLast ? 'Dorëzo ✓' : 'Tjetër →';
  document.getElementById('btn-next').onclick     = isLast ? confirmSubmit : nextQuestion;
  updateQuestionNav();
}

function selectAnswer(qIdx, optIdx) {
  quizState.answers[qIdx] = optIdx;
  api('/api/session/save-answer', 'POST', {
    session_id: quizState.session_id, question_index: qIdx, answer: optIdx
  });
  renderQuestion(qIdx);
}

function goToQuestion(idx) { quizState.current = idx; renderQuestion(idx); }
function prevQuestion()    { if (quizState.current > 0) goToQuestion(quizState.current - 1); }
function nextQuestion()    { if (quizState.current < quizState.questions.length - 1) goToQuestion(quizState.current + 1); }

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    quizState.remaining--;
    const el = document.getElementById('timer-display');
    el.textContent = formatTime(quizState.remaining);
    el.className = '';
    if (quizState.remaining <= 300) el.classList.add('warn');
    if (quizState.remaining <= 60)  el.classList.add('danger');
    if (quizState.remaining <= 0)   { clearInterval(timerInterval); submitQuiz(true); }
  }, 1000);
}

function confirmSubmit() {
  const unanswered = quizState.questions.length - Object.keys(quizState.answers).length;
  const warnEl = document.getElementById('unanswered-warn');
  if (unanswered > 0) {
    warnEl.textContent = `⚠ Ke ${unanswered} pyetje të papërgjigjura!`;
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }
  openModal('modal-confirm-submit');
}

async function submitQuiz(auto = false) {
  closeModal('modal-confirm-submit');
  clearInterval(timerInterval);
  try {
    const data = await api('/api/session/submit', 'POST', {
      session_id: quizState.session_id,
      answers:    quizState.answers
    });
    if (data.error) { alert('Gabim: ' + data.error); return; }
    showResult(data);
  } catch (e) {
    alert('Gabim lidhjeje gjatë dorëzimit!');
  }
}

function showResult(data) {
  const pct    = Math.round(data.score / data.max_score * 100);
  const passed = pct >= 50;
  const letters = ['A', 'B', 'C', 'D'];

  document.getElementById('result-summary').innerHTML = `
    <div class="score-circle" style="--pct:${pct * 3.6}deg">
      <div class="score-inner">
        <div class="score-num" style="color:${passed ? 'var(--green)' : 'var(--red)'}">${data.score}</div>
        <div class="score-max">/ ${data.max_score}</div>
      </div>
    </div>
    <h2 style="font-size:26px;font-weight:800;margin-bottom:8px">${data.student_name} ${data.student_surname}</h2>
    <p class="text-muted mb-3">${data.subject} · Klasa ${data.grade} · ${data.school}</p>
    <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px">
      <span class="badge ${passed ? 'badge-green' : 'badge-red'}">${pct}%</span>
      <span class="badge badge-blue">ID: ${data.session_id.substring(0,8).toUpperCase()}</span>
      <span class="badge badge-gold">⏱ ${formatDuration(data.duration_taken)}</span>
    </div>
    <div class="grid-3" style="gap:12px;margin-bottom:8px;text-align:center">
      <div class="card" style="padding:16px">
        <div style="font-size:28px;font-weight:800;color:var(--green)">${data.correct_questions.length}</div>
        <div class="text-muted text-sm">Saktë</div>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-size:28px;font-weight:800;color:var(--red)">${data.wrong_questions.length}</div>
        <div class="text-muted text-sm">Gabim</div>
      </div>
      <div class="card" style="padding:16px">
        <div style="font-size:28px;font-weight:800;color:var(--accent)">${data.total_questions}</div>
        <div class="text-muted text-sm">Gjithsej</div>
      </div>
    </div>`;

  const wrongSec  = document.getElementById('result-wrong-section');
  const wrongList = document.getElementById('result-wrong-list');

  if (data.wrong_questions?.length > 0) {
    wrongSec.style.display = 'block';

    wrongList.innerHTML = data.wrong_questions.map(wq => `
      <div class="question-builder" style="margin-bottom:12px">
        <div style="font-weight:600;margin-bottom:10px">
          ❌ Pyetja ${wq.index + 1}: ${escapeHtml(wq.question)}
        </div>

        ${wq.options.map((opt, oi) => {
          let cls = oi === wq.correct_answer ? 'correct' : oi === wq.your_answer ? 'wrong' : '';

          return `
            <div class="option-btn ${cls}" style="cursor:default;margin-bottom:6px">
              <span class="option-letter">${letters[oi]}</span>
              ${escapeHtml(opt)}

              ${oi === wq.correct_answer
                ? '<span class="badge badge-green" style="margin-left:auto">✓ Saktë</span>'
                : ''}

              ${oi === wq.your_answer && oi !== wq.correct_answer
                ? '<span class="badge badge-red" style="margin-left:auto">✗ Zgjedhja jote</span>'
                : ''}
            </div>
          `;
        }).join('')}
      </div>
    `).join('');

  } else {
    wrongSec.style.display = 'none';
  }

  showPage('page-result');
}

// ── ADMIN FLOW ────────────────────────────────────────────────────────────────

async function adminLogin() {
  clearError('admin-login-error');
  const data = await api('/api/admin/login', 'POST', {
    username: document.getElementById('a-username').value,
    password: document.getElementById('a-password').value
  });
  if (data.success) {
    adminSession = data;
    localStorage.setItem('adminSession', JSON.stringify(data));
    showPage('page-admin');
    loadTests();
  } else {
    showError('admin-login-error', data.error || 'Kredencialet janë të gabuara');
  }
}

function adminLogout() {
  adminSession = null;
  localStorage.removeItem('adminSession');
  showPage('page-landing');
}

async function loadTests() {
  const data      = await api('/api/tests');
  const container = document.getElementById('tests-list');
  const filter    = document.getElementById('results-test-filter');
  filter.innerHTML = '<option value="">Të gjitha testet</option>';

  if (!data.length) {
    container.innerHTML = `<div class="card text-center" style="padding:48px">
      <div style="font-size:48px;margin-bottom:16px">📭</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:8px">Asnjë test nuk është krijuar</div>
      <p class="text-muted">Klikoni "Krijo Test të Ri" për të filluar</p>
    </div>`;
    return;
  }

  const icons = {
    'Matematikë':'🔢','Fizikë':'⚛️','Kimi':'🧪','Biologji':'🧬',
    'Gjuhë shqipe':'📖','Gjuhë angleze':'🇬🇧','Histori':'🏛️','Gjeografi':'🌍','TIK':'💻'
  };

  container.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Lënda</th><th>Kodi i Testit</th><th>Klasat</th><th>Pyetjet</th>
      <th>Data e Krijimit</th><th>Statusi</th><th>Veprime</th>
    </tr></thead>
    <tbody>
      ${data.map(t => {
        filter.innerHTML += `<option value="${t.id}">${t.subject} (${t.test_code})</option>`;
        return `<tr>
          <td><div class="flex flex-center gap-2"><span>${icons[t.subject]||'📝'}</span><strong>${t.subject}</strong></div></td>
          <td><span class="badge badge-blue mono" style="font-size:14px;letter-spacing:3px">${t.test_code}</span></td>
          <td>${t.grade_levels.join(', ')}</td>
          <td>${getQuestionCount(t.subject)} pyetje</td>
          <td class="text-muted">${formatDate(t.created_at)}</td>
          <td><span class="badge ${t.active?'badge-green':'badge-red'}">${t.active?'Aktiv':'Joaktiv'}</span></td>
          <td><div class="flex gap-2">
            <a href="/api/export/excel/${t.id}" class="btn btn-secondary btn-sm">📊 Excel</a>
            <a href="/api/export/pdf/${t.id}"   class="btn btn-secondary btn-sm">📄 PDF</a>
            <button class="btn btn-danger btn-sm" onclick="deleteTest('${t.id}')">🗑</button>
          </div></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function getQuestionCount(subject) {
  if (subject === 'Biologji') return 20;
  if (['Matematikë','Fizikë','Kimi','Biologji'].includes(subject)) return 10;
  return 20;
}

async function deleteTest(id) {
  if (!confirm('Je i sigurt që dëshiron ta fshish këtë test?')) return;
  await api(`/api/tests/${id}`, 'DELETE');
  loadTests();
}

// ── CREATE TEST ───────────────────────────────────────────────────────────────

let questionsData       = [];
let targetQuestionCount = 10;

function openCreateTest() {
  questionsData = [];
  document.getElementById('ct-subject').value            = '';
  document.getElementById('questions-builder').innerHTML = '';
  document.getElementById('q-count-label').textContent   = '0 pyetje';
  clearError('create-test-error');
  document.getElementById('ct-info').classList.add('hidden');
  openModal('modal-create-test');
}

function updateQuestionCount() {
  const subj = document.getElementById('ct-subject').value;
  if (!subj) return;
  targetQuestionCount = getQuestionCount(subj);
  const ptsPerQ = targetQuestionCount === 10 ? 10 : 5;
  const info    = document.getElementById('ct-info');
  info.classList.remove('hidden');
  info.innerHTML = `ℹ️ Lënda <strong>${subj}</strong> kërkon <strong>${targetQuestionCount} pyetje</strong>. Secila = <strong>${ptsPerQ} pikë</strong> (Total: 100 pikë)`;
  questionsData = [];
  document.getElementById('questions-builder').innerHTML = '';
  for (let i = 0; i < targetQuestionCount; i++) addQuestion();
}

function addQuestion() {
  const idx = questionsData.length;
  questionsData.push({ question: '', options: ['','','',''], correct: 0 });
  const builder = document.getElementById('questions-builder');
  const div = document.createElement('div');
  div.className = 'question-builder';
  div.id = `qb-${idx}`;
  div.innerHTML = `
    <div class="qb-header">
      <span style="font-size:13px;font-weight:700;color:var(--accent)">Pyetja ${idx + 1}</span>
      <button class="btn btn-danger btn-sm" onclick="removeQuestion(${idx})">✕</button>
    </div>
    <div class="form-group">
      <textarea class="form-textarea" placeholder="Shkruaj pyetjen këtu..."
        oninput="questionsData[${idx}].question=this.value" rows="2"></textarea>
    </div>
    <div class="options-grid">
      ${['A','B','C','D'].map((l, oi) => `
        <div style="display:flex;align-items:center;gap:8px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0">
            <input type="radio" name="correct-${idx}" value="${oi}" ${oi===0?'checked':''}
              onchange="questionsData[${idx}].correct=${oi}">
            <span class="option-letter" style="background:var(--surface)">${l}</span>
          </label>
          <input class="form-input" placeholder="Opsioni ${l}"
            oninput="questionsData[${idx}].options[${oi}]=this.value" style="flex:1">
        </div>`).join('')}
    </div>
    <div class="mt-1 text-muted text-sm">☝️ Zgjidh butonin radio pranë opsionit të saktë</div>`;
  builder.appendChild(div);
  document.getElementById('q-count-label').textContent = `${questionsData.length} pyetje`;
}

function removeQuestion(idx) {
  const temp    = [...questionsData];
  const builder = document.getElementById('questions-builder');
  temp.splice(idx, 1);
  builder.innerHTML = '';
  questionsData = [];
  temp.forEach((q, newIdx) => {
    addQuestion();
    setTimeout(() => {
      const ta = builder.querySelector(`#qb-${newIdx} textarea`);
      if (ta) ta.value = q.question;
      const inputs = builder.querySelectorAll(`#qb-${newIdx} input:not([type=radio])`);
      q.options.forEach((opt, oi) => { if (inputs[oi]) inputs[oi].value = opt; });
      questionsData[newIdx] = q;
    }, 0);
  });
}

async function saveTest() {
  clearError('create-test-error');
  const subject = document.getElementById('ct-subject').value;
  if (!subject) return showError('create-test-error', 'Zgjidh lëndën mësimore!');

  const gradeLevels = Array.from(document.querySelectorAll('#ct-grades input:checked')).map(cb => cb.value);
  if (!gradeLevels.length) return showError('create-test-error', 'Zgjidh të paktën një klasë!');

  if (questionsData.length !== targetQuestionCount)
    return showError('create-test-error', `Duhen saktësisht ${targetQuestionCount} pyetje! Keni ${questionsData.length}.`);

  for (let i = 0; i < questionsData.length; i++) {
    const q = questionsData[i];
    if (!q.question.trim()) return showError('create-test-error', `Pyetja ${i+1} është bosh!`);
    for (let j = 0; j < 4; j++) {
      if (!q.options[j]?.trim())
        return showError('create-test-error', `Pyetja ${i+1}: Opsioni ${['A','B','C','D'][j]} është bosh!`);
    }
  }

  const data = await api('/api/tests', 'POST', {
    subject, grade_levels: gradeLevels, questions: questionsData,
    duration_seconds: 3600, admin_id: adminSession.adminId
  });

  if (data.success) {
    closeModal('modal-create-test');
    loadTests();
    alert(`✅ Testi u krijua me sukses!\n\nKodi i Testit: ${data.test_code}\n\nNdaje këtë kod me nxënësit.`);
  } else {
    showError('create-test-error', data.error || 'Gabim gjatë ruajtjes');
  }
}

// ── RESULTS ───────────────────────────────────────────────────────────────────

async function loadResults() {
  const testId = document.getElementById('results-test-filter').value;
  const data   = await api(testId ? `/api/results/${testId}` : '/api/results/all');

  const exportBtns = document.getElementById('results-export-btns');
  if (testId) {
    exportBtns.classList.remove('hidden');
    exportBtns.innerHTML = `
      <a href="/api/export/excel/${testId}" class="btn btn-success btn-sm">📊 Eksporto Excel</a>
      <a href="/api/export/pdf/${testId}"   class="btn btn-secondary btn-sm">📄 Eksporto PDF</a>`;
  } else {
    exportBtns.classList.add('hidden');
  }

  if (!data.length) {
    document.getElementById('results-container').innerHTML = `<div class="card text-center" style="padding:48px">
      <div style="font-size:48px;margin-bottom:16px">📭</div>
      <p class="text-muted">Asnjë rezultat ende</p>
    </div>`;
    return;
  }

  const medal = r => r===1?'🥇':r===2?'🥈':r===3?'🥉':r;

  document.getElementById('results-container').innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>ID Sesioni</th><th>Emri</th><th>Klasa</th><th>Shkolla</th>
      ${!testId ? '<th>Lënda</th>' : ''}
      <th>Pikët</th><th>%</th><th>Kohëzgjatja</th><th>Gabime</th><th>Detaje</th>
    </tr></thead>
    <tbody>
      ${data.map((s, i) => {
        const pct = Math.round(s.score / s.max_score * 100);
        const cls = pct>=70?'badge-green':pct>=50?'badge-gold':'badge-red';
        const rank = s.rank || (i + 1);
        return `<tr class="rank-${rank}">
          <td style="font-size:18px">${medal(rank)}</td>
          <td><span class="mono text-muted" style="font-size:11px">${s.id.substring(0,8).toUpperCase()}</span></td>
          <td><strong>${s.student_name} ${s.student_surname}</strong></td>
          <td><span class="badge badge-blue">${s.grade}</span></td>
          <td>${s.school}</td>
          ${!testId ? `<td>${s.subject}</td>` : ''}
          <td><strong>${s.score}/${s.max_score}</strong></td>
          <td><span class="badge ${cls}">${pct}%</span></td>
          <td class="text-muted">${formatDuration(s.duration_taken)}</td>
          <td><span class="badge badge-red">${s.wrong_questions.length} ✗</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="showStudentDetailById('${s.id}')">👁</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function showStudentDetailById(id) {
  const s = window.resultsCache[id];
  if (!s) return;

  showStudentDetail(s);
}

function showStudentDetail(s) {
  document.getElementById('modal-student-name').textContent =
    `${s.student_name} ${s.student_surname}`;

  const pct = Math.round(s.score / s.max_score * 100);
  const letters = ['A','B','C','D'];

  let html = `
    <div class="grid-2 mb-2">
      <div class="card" style="padding:16px">
        <div class="text-muted text-sm mb-1">Pikët</div>
        <div style="font-size:28px;font-weight:800;color:${pct>=50?'var(--green)':'var(--red)'}">
          ${s.score}/${s.max_score}
        </div>
        <div class="badge ${pct>=50?'badge-green':'badge-red'}">${pct}%</div>
      </div>

      <div class="card" style="padding:16px">
        <div class="text-muted text-sm mb-1">Informacione</div>
        <div class="text-sm"><strong>ID:</strong> <span class="mono">${s.id.substring(0,8).toUpperCase()}</span></div>
        <div class="text-sm"><strong>Klasa:</strong> ${s.grade}</div>
        <div class="text-sm"><strong>Shkolla:</strong> ${s.school}</div>
        <div class="text-sm"><strong>Kohëzgjatja:</strong> ${formatDuration(s.duration_taken)}</div>
      </div>
    </div>`;

  if (s.wrong_questions?.length > 0) {
    html += `<div style="font-size:14px;font-weight:700;margin-bottom:12px">
      ❌ Pyetjet me Gabime (${s.wrong_questions.length})
    </div>`;

    s.wrong_questions.forEach(wq => {
      html += `
        <div class="question-builder" style="margin-bottom:10px">
          <div style="font-weight:600;margin-bottom:8px;font-size:13px">
            Pyetja ${wq.index+1}: ${escapeHtml(wq.question)}
          </div>

          ${wq.options.map((opt, oi) => {
            const cls =
              oi === wq.correct_answer ? 'correct' :
              oi === wq.your_answer ? 'wrong' : '';

            return `
              <div class="option-btn ${cls}" style="cursor:default;margin-bottom:4px;padding:8px 12px;font-size:12px">
                <span class="option-letter" style="width:22px;height:22px;font-size:10px">${letters[oi]}</span>
                ${escapeHtml(opt)}

                ${oi === wq.correct_answer
                  ? '<span class="badge badge-green" style="margin-left:auto">✓</span>'
                  : ''}

                ${oi === wq.your_answer && oi !== wq.correct_answer
                  ? '<span class="badge badge-red" style="margin-left:auto">✗</span>'
                  : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    });

  } else {
    html += `<div class="alert alert-success">
      🎉 Të gjitha pyetjet u përgjigjën saktë!
    </div>`;
  }

  document.getElementById('modal-student-content').innerHTML = html;
  openModal('modal-student-detail');
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (quizState && document.getElementById('page-quiz').classList.contains('active')) {
    if (e.key === 'ArrowRight') nextQuestion();
    if (e.key === 'ArrowLeft')  prevQuestion();
    if (['1','2','3','4'].includes(e.key)) selectAnswer(quizState.current, parseInt(e.key) - 1);
  }
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

// ── AUTO-RESTORE ADMIN SESSION ────────────────────────────────────────────────

if (adminSession) {
  showPage('page-admin');
  loadTests();
}