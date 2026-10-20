// Test data preparation logic for PDF export
const statsMap = {
    'user1': { hits: 158, total: 189, score: 1580 }
};
const usersMap = {
    'user1': { name: 'Reinaldo leal', email: 'reinaldoleal.la@gmail.com', role: 'admin' }
};
const answerLogsList = [];
const questionsBank = [
    { id: '1', question: 'Qual o valor padrão do capacitor?', series: 'Básico', answer: '10uF', options: ['5uF', '10uF', '20uF'] },
    { id: '2', question: 'Como testar a tensão?', series: 'Intermediário', answer: 'Multímetro', options: ['Termômetro', 'Multímetro'] }
];

let drilldownState = { filterUser: 'user1', filterUserName: 'Reinaldo leal', filterSeries: 'all', searchTerm: '' };

const usersWithStats = Object.entries(usersMap || {}).map(([uid, u]) => {
    const st = (statsMap && statsMap[uid]) || { hits: 0, total: 0, score: 0 };
    const errors = Math.max(0, (st.total || 0) - (st.hits || 0));
    const acc = (st.total || 0) > 0 ? Math.round(((st.hits || 0) / st.total) * 100) : 0;
    return {
        uid,
        name: u.name || 'Colaborador',
        email: u.email || '',
        hits: st.hits || 0,
        total: st.total || 0,
        errors,
        accuracy: acc
    };
});

let errorLogs = (answerLogsList || []).filter(l => !l.isCorrect);
if (drilldownState.filterUser) {
    errorLogs = errorLogs.filter(l => l.userId === drilldownState.filterUser);
}
const questionsMap = {};
errorLogs.forEach(log => {
    const qKey = (log.questionText || '').trim();
    if (!qKey) return;
    if (!questionsMap[qKey]) {
        const qOrig = (questionsBank || []).find(qb => (qb.question || '').trim() === qKey);
        questionsMap[qKey] = {
            id: log.questionId || (qOrig ? qOrig.id : null),
            question: qKey,
            series: log.questionSeries || (qOrig ? qOrig.series : 'Básico'),
            answer: log.correctAnswer || (qOrig ? qOrig.answer : ''),
            errorCount: 0,
            failedUsers: []
        };
    }
    questionsMap[qKey].errorCount++;
    questionsMap[qKey].failedUsers.push({
        userId: log.userId,
        userName: log.userName,
        userEmail: log.userEmail,
        studentAnswer: log.studentAnswer
    });
});

const targetUserObj = drilldownState.filterUser ? usersWithStats.find(u => u.uid === drilldownState.filterUser) : null;
const totalAggregatedErrors = targetUserObj ? targetUserObj.errors : usersWithStats.reduce((acc, u) => acc + u.errors, 0);

if (Object.keys(questionsMap).length === 0 && (questionsBank || []).length > 0 && totalAggregatedErrors > 0) {
    const failedUsersList = targetUserObj ? [targetUserObj] : usersWithStats.filter(u => u.errors > 0);
    (questionsBank || []).forEach(qb => {
        const qKey = (qb.question || '').trim();
        questionsMap[qKey] = {
            id: qb.id,
            question: qKey,
            series: qb.series || 'Básico',
            answer: qb.answer || '',
            errorCount: Math.max(1, Math.round(totalAggregatedErrors / Math.max(1, questionsBank.length))),
            failedUsers: failedUsersList.map(u => ({
                userId: u.uid,
                userName: u.name,
                userEmail: u.email,
                studentAnswer: 'Registrado no histórico acumulado (' + u.errors + ' erro(s) geral)',
                timestamp: null
            }))
        };
    });
}

let items = Object.values(questionsMap);
if (drilldownState.filterUser) {
    items = items.filter(it => (it.failedUsers || []).some(fu => fu.userId === drilldownState.filterUser));
}

console.log('Total items found for PDF:', items.length);
console.log('Sample item:', items[0]);
