// Dev fixture seeder for the local Hydro instance (http://127.0.0.1:8888).
//
//   node dev-seed.mjs
//
// Creates a believable dataset for UI work: users, domain roles, contests
// (ended / running / upcoming), homework, a training, discussion threads with
// replies, and submissions that make contests, rankings and statistics non-empty.
// It is destructive for fixture data only: contests, homeworks, trainings,
// discussions, their status/record documents and users with uid > 2.
import { MongoClient, ObjectId } from 'mongodb';

const ORIGIN = 'http://127.0.0.1:8888';
const MONGO_URL = 'mongodb://127.0.0.1:27017';
const DB = 'hydro';
const DOMAIN = 'system';
const ADMIN = { uname: 'admin', password: 'admin123' };

const DOC_PROBLEM = 10;
const DOC_NODE = 20;
const DOC_DISCUSSION = 21;
const DOC_REPLY = 22;
const DOC_CONTEST = 30;
const DOC_TRAINING = 40;

const STATUS = {
  WA: 2, AC: 1, TLE: 3, MLE: 4, RE: 6, CE: 7, WA2: 2,
};

const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- http client
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function req(path, { method = 'GET', form, accept = 'text/html' } = {}) {
  const headers = { accept, 'user-agent': 'hydro-seed' };
  if (jar.size) headers.cookie = cookieHeader();
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(ORIGIN + path, {
    method, headers, body, redirect: 'manual',
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get('location') };
}

async function post(path, form) {
  const res = await req(path, { method: 'POST', form, accept: 'application/json' });
  let parsed = null;
  try { parsed = JSON.parse(res.text); } catch { /* html or redirect */ }
  return { ...res, parsed };
}

// ------------------------------------------------------------------ sequences
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rand = seededRandom(20261119);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

const USERS = [
  { email: 'teacher@hydro.local', uname: 'teacher', pass: 'Teacher123', name: '王老师', role: '教师' },
  { email: 'alice@hydro.local', uname: 'alice', pass: 'Alice1234', name: '爱丽丝' },
  { email: 'bob@hydro.local', uname: 'bob', pass: 'Bob12345', name: '小鲍' },
  { email: 'carol@hydro.local', uname: 'carol', pass: 'Carol123', name: '卡罗' },
  { email: 'dave@hydro.local', uname: 'dave', pass: 'Dave1234', name: '大卫' },
  { email: 'eve@hydro.local', uname: 'eve', pass: 'Eve12345', name: '伊芙' },
  { email: 'frank@hydro.local', uname: 'frank', pass: 'Frank123', name: '弗兰克' },
  { email: 'grace@hydro.local', uname: 'grace', pass: 'Grace123', name: '格蕾丝' },
  { email: 'heidi@hydro.local', uname: 'heidi', pass: 'Heidi123', name: '海蒂' },
];

const PROBLEMS = {
  2: 'A+B Problem',
  3: '区间求和',
  4: '最短路径',
  5: '括号序列',
  6: 'KMP 字符串匹配',
  7: '线段树维护历史最大值',
  8: '矩阵快速幂',
  9: '二分图最大匹配',
};

const CODES = {
  'cc.cc17': `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    long long a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  'py.py3': `import sys

def main():
    data = sys.stdin.read().split()
    print(int(data[0]) + int(data[1]))

main()`,
  'java.java': `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(sc.nextLong() + sc.nextLong());
    }
}`,
};
const LANGS = Object.keys(CODES);

// --------------------------------------------------------------------- main
const client = await MongoClient.connect(MONGO_URL);
const db = client.db(DB);

log('· clearing previous fixtures');
await db.collection('document').deleteMany({ docType: { $in: [DOC_NODE, DOC_DISCUSSION, DOC_REPLY, DOC_CONTEST, DOC_TRAINING] } });
await db.collection('document.status').deleteMany({});
await db.collection('record').deleteMany({});
await db.collection('record.stat').deleteMany({});
await db.collection('record.history').deleteMany({});
await db.collection('domain.role').deleteMany({ _id: { $nin: ['guest', 'default', 'root'] } });
await db.collection('domain.user').deleteMany({ uid: { $gt: 2 } });
// accounts are reused across runs (the userimport handler dedups by email, and the
// server keeps a short-lived udoc cache, so deleting and re-creating them is a race)
await db.collection('token').deleteMany({ uid: { $gt: 2 } });

log('· login as admin');
const login = await post('/login', ADMIN);
if (!jar.size) throw new Error(`login failed: ${login.status} ${login.text.slice(0, 200)}`);

log('· init discussion nodes');
const nodes = await post('/domain/dashboard', { operation: 'init_discussion_node' });
log('   nodes ->', nodes.status);

log('· import users');
const usersPayload = USERS.map((u) => `${u.email}\t${u.uname}\t${u.pass}\t${u.name}`).join('\n');
const imported = await post('/manage/userimport', { users: usersPayload });
log('   import ->', imported.status, imported.parsed?.messages?.join(' | ') ?? '');

const udict = {};
for (const u of await db.collection('user').find({}).toArray()) udict[u.uname] = u;
const students = USERS.filter((u) => u.uname !== 'teacher').map((u) => udict[u.uname]).filter(Boolean);
const teacher = udict.teacher;
const adminUser = udict.admin;
log('   users:', Object.keys(udict).join(', '));

// profile polish: display name + a visible bio, without touching priv
await db.collection('user').updateMany({ _id: { $gt: 2 } }, { $set: { loginat: new Date() } });
if (teacher) {
  await db.collection('user').updateOne({ _id: teacher._id }, {
    $set: {
      displayName: '王老师',
      bio: '带你们从零开始打 ACM。课程答疑请发讨论区，标注题目编号。',
      school: '示例大学',
    },
  });
}

// domain role used by the import/role pages
await db.collection('domain.role').insertOne({
  _id: '教师',
  domainId: DOMAIN,
  displayName: '教师',
  system: false,
  perm: 'PERM_VIEW_PROBLEM_PERM,PERM_VIEW_PROBLEM,PERM_VIEW_PROBLEM_HIDDEN,PERM_CREATE_HOMEWORK,PERM_EDIT_HOMEWORK,PERM_CREATE_CONTEST,PERM_EDIT_CONTEST,PERM_CREATE_TRAINING,PERM_EDIT_TRAINING',
  priv: 0,
  grant: 'Default',
  inherit: 'default',
});
if (teacher) {
  await db.collection('domain.user').updateOne(
    { domainId: DOMAIN, uid: teacher._id },
    { $set: { role: '教师', join: true } },
    { upsert: true },
  );
}

// ------------------------------------------------------------------- contests
const now = Date.now();
const hours = (n) => n * 3600 * 1000;
// the server reads these as wall-clock time in the operator's time zone, so
// format in UTC+8 rather than UTC (toISOString would shift the whole schedule)
const TZ_OFFSET = 8 * 3600 * 1000;
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => {
  const t = new Date(d + TZ_OFFSET);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
};
const isoTime = (d) => {
  const t = new Date(d + TZ_OFFSET);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
};

async function createContest({
  title, rule, beginAt, durationH, pids, content, rated,
}) {
  const form = {
    operation: 'update',
    beginAtDate: isoDate(beginAt),
    beginAtTime: isoTime(beginAt),
    duration: String(durationH),
    title,
    content,
    rule,
    pids: pids.join(','),
  };
  if (rated) form.rated = 'on';
  const res = await post('/contest/create', form);
  const tid = res.parsed?.tid ?? (res.location?.match(/contest\/([0-9a-f]{24})/)?.[1]);
  log(`   contest "${title}" ->`, res.status, tid ?? res.text.slice(0, 120));
  return tid ? new ObjectId(tid) : null;
}

log('· contests');
const contestEnded = await createContest({
  title: '周末算法挑战赛 #1',
  rule: 'acm',
  beginAt: now - hours(30),
  durationH: 3,
  pids: [2, 3, 4],
  rated: true,
  content: `## 赛制说明

- ACM 赛制，三人一队，**罚时**按分钟累计。
- 三题，难度递增；建议先把 A 题稳住。
- 比赛期间可以反复提交，最后一发生效。

> 有疑问请在题目讨论区提问，不要在赛时私聊出题人。`,
});
const contestRunning = await createContest({
  title: 'OI 模拟赛 · 数据结构专场',
  rule: 'oi',
  beginAt: now - hours(1),
  durationH: 4,
  pids: [7, 8, 9],
  content: `## 注意事项

1. OI 赛制，**只有最后一次提交**计分，可以放心试错。
2. 三道题分别考察线段树、矩阵快速幂、二分图匹配。
3. 内存限制 256MB，时间限制 1000ms。

祝好运。`,
});
const contestUpcoming = await createContest({
  title: '新手入门练习赛',
  rule: 'acm',
  beginAt: now + hours(48),
  durationH: 2,
  pids: [2, 5],
  content: `给刚接触算法竞赛的同学准备的练习赛。

- A 题：A+B，熟悉提交流程
- B 题：括号序列，栈的入门题

没有排名压力，做不出来可以看题解。`,
});

const contestDocs = {};
for (const tid of [contestEnded, contestRunning, contestUpcoming].filter(Boolean)) {
  const doc = await db.collection('document').findOne({ docId: tid, docType: DOC_CONTEST });
  if (doc) contestDocs[tid.toHexString()] = doc;
}
log('   windows:', Object.values(contestDocs).map((d) => `${d.title} ${d.beginAt.toISOString()} → ${d.endAt.toISOString()}`).join(' ; '));

// ------------------------------------------------------------------ homework
async function createHomework({
  title, beginAt, penaltySince, extensionDays, pids, content,
}) {
  const res = await post('/homework/create', {
    operation: 'update',
    beginAtDate: isoDate(beginAt),
    beginAtTime: isoTime(beginAt),
    penaltySinceDate: isoDate(penaltySince),
    penaltySinceTime: isoTime(penaltySince),
    extensionDays: String(extensionDays),
    penaltyRules: '{}',
    title,
    content,
    pids: pids.join(','),
  });
  const tid = res.parsed?.tid ?? (res.location?.match(/homework\/([0-9a-f]{24})/)?.[1]);
  log(`   homework "${title}" ->`, res.status, tid ?? res.text.slice(0, 120));
  return tid ? new ObjectId(tid) : null;
}

log('· homework');
const hwOpen = await createHomework({
  title: '第 1 周作业 · 基础算法',
  beginAt: now - hours(72),
  penaltySince: now + hours(120),
  extensionDays: 3,
  pids: [2, 3],
  content: '完成 A+B 与区间求和，重点练习输入输出与树状数组。迟交按天扣分。',
});
const hwExpired = await createHomework({
  title: '第 2 周作业 · 字符串专题',
  beginAt: now - hours(240),
  penaltySince: now - hours(24),
  extensionDays: 2,
  pids: [5, 6],
  content: '括号序列 + KMP，注意边界情况。已过截止时间，可提交但会标记迟交。',
});

// ------------------------------------------------------------------ training
log('· training');
const dag = [
  {
    _id: 1, title: '第一关 · 数据结构热身', requireNids: [], pids: [3],
  },
  {
    _id: 2, title: '第二关 · 最短路', requireNids: [1], pids: [4],
  },
  {
    _id: 3, title: '第三关 · 二分图匹配', requireNids: [2], pids: [9],
  },
];
const trainingRes = await post('/training/create', {
  title: 'ACM 进阶训练 · 图论与数据结构',
  content: '按关卡推进的训练计划，每关通过后解锁下一关。',
  description: '三关，覆盖树状数组、最短路与二分图匹配。',
  dag: JSON.stringify(dag),
  pin: '0',
});
const tidTraining = trainingRes.parsed?.tid ?? trainingRes.location?.match(/training\/([0-9a-f]{24})/)?.[1];
log('   training ->', trainingRes.status, tidTraining ?? trainingRes.text.slice(0, 120));

const dag2 = [
  {
    _id: 1, title: '第一关 · 枚举与模拟', requireNids: [], pids: [2],
  },
  {
    _id: 2, title: '第二关 · 前缀和与排序', requireNids: [1], pids: [3],
  },
];
const training2Res = await post('/training/create', {
  title: 'NOIP 基础训练 · 枚举与贪心',
  content: '从枚举到贪心的入门训练，两关，适合零基础。',
  description: '两关，覆盖枚举、模拟、排序与贪心选择。',
  dag: JSON.stringify(dag2),
  pin: '0',
});
const tidTraining2 = training2Res.parsed?.tid ?? training2Res.location?.match(/training\/([0-9a-f]{24})/)?.[1];
log('   training2 ->', training2Res.status, tidTraining2 ?? training2Res.text.slice(0, 120));

// --------------------------------------------------------------- discussions
log('· discussions');
const nodeNames = (await db.collection('document').find({ docType: DOC_NODE }).toArray()).map((n) => n.title || n.docId);
log('   nodes:', nodeNames.slice(0, 8).join(', '));

const THREADS = [
  {
    node: '问答',
    title: '线段树 pushdown 什么时候必须写？',
    content: `写区间加、区间求和的时候，如果只维护了 \`sum\` 而不写 pushdown，为什么有些数据会 WA？

\`\`\`cpp
void update(int p, int l, int r, int ql, int qr, int v) {
    if (ql <= l && r <= qr) { tr[p].sum += v * (r - l + 1); return; }
    int mid = (l + r) >> 1;
    if (ql <= mid) update(p << 1, l, mid, ql, qr, v);
    if (qr > mid) update(p << 1 | 1, mid + 1, r, ql, qr, v);
    pushup(p);
}
\`\`\`

我的理解是查询的时候没有把父亲的标记下推，子区间就少算了。这样对吗？`,
    replies: [
      '对。标记的含义是"整棵子树都还没加"，所以往下走之前必须把标记交给孩子，否则孩子算的是旧值。',
      '补充一点：如果查询也是整块命中，就不用下推，直接返回 sum 就行。',
    ],
  },
  {
    node: '分享',
    title: '一份能直接用的对拍脚本',
    content: `每次手写对拍太麻烦，整理了一个 bash 版本，放到题目目录下就能跑：

\`\`\`bash
#!/usr/bin/env bash
for i in $(seq 1 200); do
  ./gen > in.txt
  ./std < in.txt > out1.txt
  ./mine < in.txt > out2.txt
  diff -q out1.txt out2.txt > /dev/null || { echo "WA on case $i"; break; }
done
echo done
\`\`\`

注意 gen 要带随机种子，不然每次都一样。`,
    replies: [
      '收藏了，比我自己写的简洁。建议加个 $RANDOM 传进去当种子。',
      'Windows 下可以用 git bash 跑，亲测没问题。',
    ],
  },
  {
    node: '求助',
    title: 'KMP 的 next 数组从 0 还是 1 开始？',
    content: '看不同题解，有人 next[0] = -1，有人 next[1] = 0，实现完全对不上，怎么统一？',
    replies: [
      '两种写法等价，只是下标起点不同。选定一种就一路用到底，别混着抄。',
    ],
  },
  {
    node: '教程',
    title: '最短路径：Dijkstra 与 SPFA 的选择',
    content: `- 边权非负、点数 1e5 级别：Dijkstra + 堆，O(m log n)。
- 有负权但无负环：SPFA 能过，但要注意它最坏是 O(nm)。
- 有负环：需要用 Bellman-Ford 判环。

比赛里看到"边权可以为负"先想想有没有负环，很多题其实是让你判环而不是求最短路。`,
    replies: [
      '补充：网格图用 SPFA 经常被卡，能用 Dijkstra 就别用。',
      '还有 0-1 边权可以用双端队列 BFS。',
    ],
  },
  {
    node: '建议',
    title: '希望题目页面能显示通过率',
    content: '做题的时候想先看看这道题的通过率再决定要不要花时间，现在要点进统计里才能看到。',
    replies: [
      '同感，列表页加一列通过率会更有用。',
    ],
  },
  {
    node: '问答',
    title: '为什么矩阵快速幂要开 long long？',
    content: '模数是 1e9+7，两个数乘起来就爆 int 了，但我在中间取模了还是 WA。',
    replies: [
      '取模之前就已经溢出了。要么用 long long 乘，要么用 (a*b)%mod 之前先强转。',
      '还有一种情况：矩阵初始化的单位矩阵没清零。',
    ],
  },
];

const createdThreads = [];
const repliesCreated = [];
for (const t of THREADS) {
  const node = nodeNames.includes(t.node) ? t.node : nodeNames[0];
  if (!node) break;
  const res = await post(`/discuss/node/${encodeURIComponent(node)}/create`, {
    type: 'node',
    title: t.title,
    content: t.content,
  });
  const did = res.parsed?.did ?? res.location?.match(/discuss\/([0-9a-f]{24})/)?.[1];
  if (!did) {
    log('   thread failed:', t.title, res.status, res.text.slice(0, 120));
    continue;
  }
  createdThreads.push({ did: new ObjectId(did), replies: t.replies });
  log(`   thread "${t.title}" ->`, did);
}

// replies, authored by different students
for (const [i, thread] of createdThreads.entries()) {
  for (const [j, content] of thread.replies.entries()) {
    const res = await post(`/discuss/${thread.did}`, {
      operation: 'reply', did: String(thread.did), content,
    });
    if (res.status >= 400) log('   reply failed:', res.status, res.text.slice(0, 120));
    else repliesCreated.push({ did: thread.did, index: j });
  }
}

// spread replies across the students so the threads look like real conversations
const allReplies = await db.collection('document')
  .find({ docType: DOC_REPLY })
  .sort({ _id: 1 })
  .toArray();
for (const [i, reply] of allReplies.entries()) {
  const owner = students[i % students.length];
  await db.collection('document').updateOne(
    { _id: reply._id },
    { $set: { owner: owner?._id ?? reply.owner, view: 0 } },
  );
}
log(`   ${allReplies.length} replies reattributed`);

// views so the list does not show 0 for everything
for (const thread of createdThreads) {
  await db.collection('document').updateOne(
    { _id: thread.did },
    { $set: { views: int(12, 420) } },
  );
}

// ------------------------------------------------------------------- records
log('· submissions');
const pids = Object.keys(PROBLEMS).map(Number);
const judgeTexts = (status) => {
  switch (status) {
    case STATUS.AC: return ['Accepted'];
    case STATUS.WA: return ['Wrong Answer', '答案错误'];
    case STATUS.TLE: return ['Time Limit Exceeded', '运行超时'];
    case STATUS.RE: return ['Runtime Error', '运行时错误'];
    case STATUS.CE: return ['Compile Error', '编译错误'];
    default: return ['Judged'];
  }
};

const rdocs = [];
function makeRecord({
  uid, pid, status, contest = null, when,
}) {
  const lang = pick(LANGS);
  const code = CODES[lang];
  const tle = status === STATUS.TLE;
  const rdoc = {
    _id: new ObjectId(
      Math.floor(when / 1000).toString(16).padStart(8, '0')
      + int(0, 0xffffff).toString(16).padStart(6, '0')
      + int(0, 0xffffffff).toString(16).padStart(8, '0')
      + int(0, 0xffff).toString(16).padStart(4, '0').slice(0, 2),
    ),
    domainId: DOMAIN,
    pid,
    uid,
    lang,
    code,
    score: status === STATUS.AC ? 100 : status === STATUS.WA ? int(10, 80) : 0,
    status,
    time: tle ? 1000 : int(12, 460),
    memory: int(1024, 32 * 1024),
    judgeTexts: judgeTexts(status),
    compilerTexts: status === STATUS.CE ? ['main.cpp:3:5: error: expected ;'] : [],
    testCases: [],
    judger: 1,
    progress: 100,
    judgeAt: new Date(when + 4000),
    rejudged: false,
  };
  if (contest) rdoc.contest = contest;
  rdocs.push(rdoc);
  return rdoc;
}

// regular practice submissions spread over the last 10 days
for (const student of students) {
  const solved = new Set();
  const attempts = int(3, 7);
  for (let i = 0; i < attempts; i += 1) {
    const pid = pick(pids);
    const when = now - hours(int(1, 240));
    const lucky = rand() < (solved.has(pid) ? 0.05 : 0.55);
    const status = lucky ? STATUS.AC : pick([STATUS.WA, STATUS.WA, STATUS.TLE, STATUS.RE, STATUS.CE]);
    if (lucky) solved.add(pid);
    makeRecord({ uid: student._id, pid, status, when });
  }
}

// contest submissions: only for the ended and running contests
const contestPlans = [
  { tid: contestEnded, pids: [2, 3, 4] },
  { tid: contestRunning, pids: [7, 8, 9] },
].filter((p) => p.tid);

for (const plan of contestPlans) {
  const cdoc = contestDocs[plan.tid.toHexString()];
  const winStart = cdoc ? cdoc.beginAt.getTime() : now - hours(30);
  const winEnd = cdoc ? Math.min(cdoc.endAt.getTime(), now) : now;
  const span = Math.max(winEnd - winStart - 60000, 60000);
  for (const [i, student] of students.entries()) {
    for (const [j, pid] of plan.pids.entries()) {
      const attempts = int(1, 2);
      let accepted = false;
      for (let k = 0; k < attempts; k += 1) {
        const when = winStart + Math.floor(span * ((i * 0.11 + j * 0.3 + k * 0.05 + rand() * 0.08) % 1));
        const status = !accepted && rand() < 0.55 ? STATUS.AC : (rand() < 0.5 ? STATUS.WA : STATUS.TLE);
        if (status === STATUS.AC) accepted = true;
        makeRecord({
          uid: student._id, pid, status, contest: plan.tid, when,
        });
      }
    }
  }
}

// the admin (the account we browse with) solves a few problems too, so the
// owner-facing states - my status cell, training progress, profile - have data
if (adminUser) {
  for (const pid of [2, 3, 7]) {
    makeRecord({
      uid: adminUser._id, pid, status: STATUS.AC, when: now - hours(int(30, 200)),
    });
  }
}

if (rdocs.length) await db.collection('record').insertMany(rdocs);
log(`   ${rdocs.length} records`);

// per-problem status documents: these drive the "my status" cell on the problem
// page, the solved marks in the problem list and the training progress bars,
// so they have to be derived from the same records.
const psBest = new Map();
for (const r of rdocs) {
  const key = `${r.uid}:${r.pid}`;
  const prev = psBest.get(key);
  if (!prev || prev.status !== STATUS.AC) psBest.set(key, r);
}
const psdocs = [];
for (const r of psBest.values()) {
  psdocs.push({
    _id: new ObjectId(),
    domainId: DOMAIN,
    docType: DOC_PROBLEM,
    docId: r.pid,
    uid: r.uid,
    rid: r._id,
    status: r.status,
    score: r.score,
    star: false,
  });
}
if (psdocs.length) await db.collection('document.status').insertMany(psdocs);
log(`   ${psdocs.length} problem status documents`);

// contest participations + status documents, mirroring model/contest.ts stat()
// so scoreboards, rankings and per-problem cells are coherent with the records.
function acmStat(tdoc, journal) {
  const naccept = {};
  const display = {};
  const detail = {};
  let accept = 0;
  let time = 0;
  const begin = tdoc.beginAt.getTime();
  for (const j of journal) {
    if (!tdoc.pids.includes(j.pid)) continue;
    if (display[j.pid]?.status === STATUS.AC) continue;
    if (![STATUS.AC, STATUS.CE, 31, 9].includes(j.status)) naccept[j.pid] = (naccept[j.pid] ?? 0) + 1;
    const real = Math.floor((j.rid.getTimestamp().getTime() - begin) / 1000);
    const penalty = 20 * 60 * (naccept[j.pid] ?? 0);
    detail[j.pid] = {
      ...j, naccept: naccept[j.pid] ?? 0, time: real + penalty, real, penalty,
    };
    display[j.pid] = detail[j.pid];
  }
  for (const d of Object.values(display)) {
    if (d.status !== STATUS.AC) continue;
    accept += 1;
    time += d.time;
  }
  return { accept, time, detail, display };
}

function oiStat(tdoc, journal) {
  const detail = {};
  const display = {};
  let score = 0;
  for (const j of journal) {
    if (!tdoc.pids.includes(j.pid)) continue;
    if (!detail[j.pid] || detail[j.pid].score < j.score) {
      detail[j.pid] = { ...j };
      display[j.pid] = { ...j };
    }
  }
  for (const pid in display) score += display[pid].score || 0;
  return { accept: Object.keys(display).length, score, detail, display };
}

const tsdocs = [];
for (const plan of contestPlans) {
  const cdoc = contestDocs[plan.tid.toHexString()];
  if (!cdoc) continue;
  for (const student of students) {
    const mine = rdocs
      .filter((r) => r.contest && r.contest.equals(plan.tid) && r.uid === student._id)
      .sort((a, b) => a._id.getTimestamp() - b._id.getTimestamp());
    if (!mine.length) continue;
    const journal = mine.map((r) => ({
      rid: r._id, pid: r.pid, status: r.status, score: r.score, lang: r.lang,
    }));
    const stats = cdoc.rule === 'acm' ? acmStat(cdoc, journal) : oiStat(cdoc, journal);
    tsdocs.push({
      _id: new ObjectId(),
      domainId: DOMAIN,
      docType: DOC_CONTEST,
      docId: plan.tid,
      uid: student._id,
      attend: 1,
      subscribe: 1,
      startAt: new Date(Math.min(...journal.map((j) => j.rid.getTimestamp().getTime()))),
      journal,
      ...stats,
    });
  }
}
if (tsdocs.length) await db.collection('document.status').insertMany(tsdocs);
for (const plan of contestPlans) {
  const n = new Set(tsdocs.filter((t) => t.docId.equals(plan.tid)).map((t) => t.uid)).size;
  await db.collection('document').updateOne({ docId: plan.tid, docType: DOC_CONTEST }, { $set: { attend: n } });
}
log(`   ${tsdocs.length} contest participations`);

// the upcoming contest has sign-ups but no submissions yet - real life is like that
if (contestUpcoming) {
  const signups = students.slice(0, 6).map((s) => ({
    _id: new ObjectId(),
    domainId: DOMAIN,
    docType: DOC_CONTEST,
    docId: contestUpcoming,
    uid: s._id,
    attend: 1,
    subscribe: 1,
    // no startAt: the contest has not begun, so the page falls back to beginAt
    journal: [],
    accept: 0,
    time: 0,
    score: 0,
    detail: {},
    display: {},
  }));
  // the admin registers as well, so the "已参加" chip renders on the contest page
  if (adminUser) {
    signups.push({
      _id: new ObjectId(),
      domainId: DOMAIN,
      docType: DOC_CONTEST,
      docId: contestUpcoming,
      uid: adminUser._id,
      attend: 1,
      subscribe: 1,
      journal: [],
      accept: 0,
      time: 0,
      score: 0,
      detail: {},
      display: {},
    });
  }
  if (signups.length) await db.collection('document.status').insertMany(signups);
  await db.collection('document').updateOne(
    { docId: contestUpcoming, docType: DOC_CONTEST },
    { $set: { attend: signups.length } },
  );
  log('   upcoming contest sign-ups:', signups.length);
}

// problem + user statistics derived from the records we just wrote
const perProblem = new Map();
const perUser = new Map();
for (const r of rdocs) {
  const p = perProblem.get(r.pid) ?? { nSubmit: 0, nAccept: 0 };
  p.nSubmit += 1;
  if (r.status === STATUS.AC) p.nAccept += 1;
  perProblem.set(r.pid, p);

  const u = perUser.get(r.uid) ?? { nSubmit: 0, nAccept: 0, solved: new Set() };
  u.nSubmit += 1;
  if (r.status === STATUS.AC && !u.solved.has(r.pid)) {
    u.nAccept += 1;
    u.solved.add(r.pid);
  }
  perUser.set(r.uid, u);
}
for (const [pid, stat] of perProblem) {
  await db.collection('document').updateOne(
    { domainId: DOMAIN, docType: DOC_PROBLEM, docId: pid },
    { $set: { nSubmit: stat.nSubmit, nAccept: stat.nAccept } },
  );
}
// the ranking page reads domain.user counters, not the user document
for (const [uid, stat] of perUser) {
  await db.collection('domain.user').updateOne(
    { domainId: DOMAIN, uid },
    {
      $set: {
        join: true,
        nSubmit: stat.nSubmit,
        nAccept: stat.nAccept,
        rp: stat.nAccept * 100 + int(0, 60),
        rpInfo: {
          problem: stat.nAccept * 90 + int(0, 40),
          contest: stat.nAccept * 10 + int(0, 30),
        },
      },
    },
    { upsert: true },
  );
}
// a one-line bio keeps the ranking's last column meaningful
const BIOS = [
  '在补图论，最近在啃网络流。',
  '喜欢把题解写成博客，欢迎交流。',
  '刚入门，正在刷基础题单。',
  '主攻数据结构，偶尔做交互题。',
  '字符串选手，KMP 是信仰。',
  '数学方向，正在复习组合计数。',
  '每天一题，坚持第 37 天。',
  '准备校赛，专练搜索与模拟。',
];
for (const [i, [uid, stat]] of [...perUser.entries()].entries()) {
  const rp = stat.nAccept * 100 + int(0, 60);
  await db.collection('user').updateOne(
    { _id: uid },
    {
      $set: {
        nSubmit: stat.nSubmit,
        nAccept: stat.nAccept,
        rp,
        rank: i + 1,
        bio: BIOS[i % BIOS.length],
        rpInfo: { problem: stat.nAccept * 90 + int(0, 40), contest: stat.nAccept * 10 + int(0, 30) },
      },
    },
  );
}
await db.collection('domain').updateOne(
  { _id: DOMAIN },
  { $set: { bulletin: '欢迎来到示例域。这里的数据都是本地 fixture，用来验证界面排版。' } },
);

// training enrolments so the training list shows every state (in progress / not enrolled)
if (tidTraining) {
  const trainingTid = new ObjectId(tidTraining);
  const enrol = [
    {
      _id: new ObjectId(),
      domainId: DOMAIN,
      docType: DOC_TRAINING,
      docId: trainingTid,
      uid: adminUser._id,
      enroll: 1,
      doneNids: [1],
      donePids: [3],
    },
    ...students.slice(0, 5).map((s, i) => ({
      _id: new ObjectId(),
      domainId: DOMAIN,
      docType: DOC_TRAINING,
      docId: trainingTid,
      uid: s._id,
      enroll: 1,
      doneNids: i < 2 ? [1] : [],
      donePids: i < 2 ? [3] : [],
    })),
  ];
  if (enrol.length) await db.collection('document.status').insertMany(enrol);
  await db.collection('document').updateOne(
    { docId: trainingTid, docType: DOC_TRAINING },
    { $set: { enroll: enrol.length, attend: enrol.length } },
  );
  log('   training enrolments:', enrol.length);
}
if (tidTraining2) {
  const trainingTid2 = new ObjectId(tidTraining2);
  const enrol2 = students.slice(5, 8).map((s, i) => ({
    _id: new ObjectId(),
    domainId: DOMAIN,
    docType: DOC_TRAINING,
    docId: trainingTid2,
    uid: s._id,
    enroll: 1,
    doneNids: i < 1 ? [1] : [],
    donePids: i < 1 ? [1] : [],
  }));
  if (enrol2.length) await db.collection('document.status').insertMany(enrol2);
  await db.collection('document').updateOne(
    { docId: trainingTid2, docType: DOC_TRAINING },
    { $set: { enroll: enrol2.length, attend: enrol2.length } },
  );
  log('   training2 enrolments:', enrol2.length);
}

await client.close();
log('\ndone. login as any student with password shown in dev-seed.mjs, e.g. alice / Alice1234');
