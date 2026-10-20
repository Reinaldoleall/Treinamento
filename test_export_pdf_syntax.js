// Mock jsPDF
class MockJsPDF {
    constructor() {
        this.pages = 1;
        this.internal = { getNumberOfPages: () => this.pages };
    }
    setFillColor() {}
    rect() {}
    roundedRect() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    text() {}
    splitTextToSize(txt) { return [txt]; }
    addPage() { this.pages++; }
    getNumberOfPages() { return this.pages; }
    setPage() {}
    save(name) { console.log('[SAVED PDF]:', name, 'Total Pages:', this.pages); }
}

global.window = {
    jspdf: { jsPDF: MockJsPDF }
};
global.statsMap = { 'u1': { hits: 158, total: 189, score: 1580 } };
global.usersMap = { 'u1': { name: 'Reinaldo leal', email: 'reinaldoleal.la@gmail.com', role: 'admin' } };
global.answerLogsList = [];
global.questionsBank = Array.from({ length: 40 }, (_, i) => ({
    id: String(i + 1),
    question: `Pergunta de teste número ${i + 1} sobre componentes eletrônicos e medições de placas`,
    series: i % 3 === 0 ? 'Básico' : (i % 3 === 1 ? 'Intermediário' : 'Avançado'),
    answer: `Gabarito da pergunta ${i + 1}`,
    options: ['Opção A', 'Opção B', 'Opção C']
}));
global.drilldownState = { filterUser: 'u1', filterUserName: 'Reinaldo leal', filterSeries: 'all', searchTerm: '' };
global.getQuestionSeries = (q) => (typeof q === 'string' ? q : (q.series || 'Básico'));
global.showToast = (msg, type) => console.log('[TOAST]', type, msg);

// Execute function logic
function exportAnalyticsDrilldownPDF() {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        showToast('Biblioteca jsPDF não disponível.', 'warning');
        return;
    }

    try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = 210;
        const pageHeight = 297;
        const marginX = 14;
        const usableWidth = pageWidth - (marginX * 2);
        const maxContentY = 272;

        let totalHits = 0;
        let totalAnswers = 0;
        Object.values(statsMap || {}).forEach(s => {
            totalHits += (s.hits || 0);
            totalAnswers += (s.total || 0);
        });
        const totalErrors = Math.max(0, totalAnswers - totalHits);
        const overallAcc = totalAnswers > 0 ? Math.round((totalHits / totalAnswers) * 100) : 0;

        const usersWithStats = Object.entries(usersMap || {}).map(([uid, u]) => {
            const st = (statsMap && statsMap[uid]) || { hits: 0, total: 0, score: 0 };
            const errors = Math.max(0, (st.total || 0) - (st.hits || 0));
            const acc = (st.total || 0) > 0 ? Math.round(((st.hits || 0) / st.total) * 100) : 0;
            return {
                uid,
                name: u.name || 'Colaborador',
                email: u.email || '',
                role: u.role || 'user',
                hits: st.hits || 0,
                total: st.total || 0,
                errors,
                accuracy: acc
            };
        });

        const targetUserObj = drilldownState.filterUser ? usersWithStats.find(u => u.uid === drilldownState.filterUser) : null;
        const totalAggregatedErrors = targetUserObj ? targetUserObj.errors : usersWithStats.reduce((acc, u) => acc + u.errors, 0);

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
                    options: (qOrig && qOrig.options) ? qOrig.options : (log.options || []),
                    errorCount: 0,
                    failedUsers: []
                };
            }
            questionsMap[qKey].errorCount++;
            questionsMap[qKey].failedUsers.push({
                userId: log.userId,
                userName: log.userName || 'Colaborador',
                userEmail: log.userEmail || '',
                studentAnswer: log.studentAnswer || 'Incorreta',
                timestamp: log.timestamp || null
            });
        });

        if (Object.keys(questionsMap).length === 0 && (questionsBank || []).length > 0 && totalAggregatedErrors > 0) {
            const failedUsersList = targetUserObj ? [targetUserObj] : usersWithStats.filter(u => u.errors > 0);
            (questionsBank || []).forEach(qb => {
                const qKey = (qb.question || '').trim();
                questionsMap[qKey] = {
                    id: qb.id,
                    question: qKey,
                    series: qb.series || 'Básico',
                    answer: qb.answer || '',
                    options: qb.options || [],
                    errorCount: Math.max(1, Math.round(totalAggregatedErrors / Math.max(1, questionsBank.length))),
                    failedUsers: failedUsersList.map(u => ({
                        userId: u.uid,
                        userName: u.name,
                        userEmail: u.email,
                        studentAnswer: 'Registrado no histórico geral (' + u.errors + ' erro(s) geral)',
                        timestamp: null
                    }))
                };
            });
        }

        let items = Object.values(questionsMap);
        if (drilldownState.filterUser) {
            items = items.filter(it => (it.failedUsers || []).some(fu => fu.userId === drilldownState.filterUser));
        }

        function drawContinuationHeader() {
            doc.setFillColor(11, 78, 162);
            doc.rect(0, 0, pageWidth, 11, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.text('PANASONIC DO BRASIL • DIAGNÓSTICO ANALÍTICO DE TREINAMENTOS', marginX, 7.5);
        }

        doc.setFillColor(11, 78, 162);
        doc.rect(0, 0, pageWidth, 20, 'F');

        let y = 30;
        y += 6;
        y += 5;
        y += 8;

        const kpiBoxHeight = 22;
        doc.roundedRect(marginX, y, usableWidth, kpiBoxHeight, 2, 2, 'FD');
        y += kpiBoxHeight + 8;

        items.forEach((item, idx) => {
            const normSeries = getQuestionSeries(item.series || item);
            const qLines = doc.splitTextToSize(`#${idx + 1}. ${item.question || ''}`, usableWidth - 12);
            const aLines = doc.splitTextToSize(`Gabarito Oficial: ${item.answer || ''}`, usableWidth - 20);

            const usersToShow = item.failedUsers || [];
            const userRowsCount = Math.max(1, usersToShow.length);
            const qTextH = qLines.length * 4.3;
            const aBoxH = Math.max(6.5, aLines.length * 4.2 + 2.5);
            const usersListH = 5 + (userRowsCount * 5.2);
            const cardHeight = 8 + qTextH + 2 + aBoxH + 2 + usersListH + 3;

            if (y + cardHeight > maxContentY) {
                doc.addPage();
                drawContinuationHeader();
                y = 20;
            }

            doc.roundedRect(marginX, y, usableWidth, cardHeight, 1.5, 1.5, 'FD');
            y += cardHeight + 4;
        });

        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
        }

        const cleanName = (drilldownState.filterUserName || 'geral').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const filename = drilldownState.filterUser
            ? `panasonic_diagnostico_${cleanName}_${Date.now()}.pdf`
            : `panasonic_diagnostico_geral_${Date.now()}.pdf`;

        doc.save(filename);
        showToast('Diagnóstico completo exportado em PDF com sucesso!', 'success');
    } catch (e) {
        console.error('Error:', e);
    }
}

exportAnalyticsDrilldownPDF();
