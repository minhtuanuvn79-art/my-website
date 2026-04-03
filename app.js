const { createApp, ref, computed, onMounted } = Vue;

// --- CẤU HÌNH SUPABASE ---
const supabaseUrl = 'https://dtfdzuggnitsdnlutryn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0ZmR6dWdnbml0c2RubHV0cnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mjk0NTAsImV4cCI6MjA5MDUwNTQ1MH0.9Ne1ONIO9-ASkThtFZJLxV42dbyIMGkHwweIjTZ5A6Q';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

createApp({
    setup() {
        // App States
        const view = ref('login');
        const currentUser = ref(null);
        const searchUser = ref('');
        
        // --- Teacher Dashboard States ---
        const teacherTab = ref('exams'); // 'exams', 'ai-creator', 'monitor', 'games'
        
        // AI States
        const aiPrompt = ref('');
        const isGenerating = ref(false);
        const aiMatrix = ref({ mc: true, tf: false, sa: false });
        const aiUploadedImage = ref(null);
        const aiImageBase64 = ref('');

        // Auth & User Management States
        const authForm = ref({ name: '', password: '', role: 'student' });
        const showEditModal = ref(false);
        const editUserData = ref({ id: '', name: '', password: '', role: '' });
        const showAddModal = ref(false);
        const newUserData = ref({ name: '', password: '', role: 'teacher' });

        // Data Storage
        const FIXED_ACCOUNTS = [{ id: 1, name: 'admin', password: 'admin123', role: 'admin' }];
        const users = ref([]);
        const exams = ref([]);
        const allResults = ref([]);

        // --- HỆ THỐNG CHỐNG GIAN LẬN ---
        const cheatWarnings = ref(0);

        const shuffleArray = (array) => {
            let currentIndex = array.length, randomIndex;
            while (currentIndex !== 0) {
                randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
            }
            return array;
        };

        const handleVisibilityChange = () => {
            if (view.value === 'exam-room' && document.hidden) {
                cheatWarnings.value++;
                showNotify(`CẢNH BÁO: Bạn đã rời khỏi màn hình thi ${cheatWarnings.value} lần!`, 'error');
                if (cheatWarnings.value >= 3) {
                    alert('Bạn đã vi phạm quy chế thi (chuyển tab quá 3 lần). Hệ thống tự động thu bài!');
                    submitExam();
                }
            }
        };

        // --- DATABASE SYNC ---
        const loadData = async () => {
            const [uRes, eRes, rRes] = await Promise.all([
                supabaseClient.from('users').select('*'),
                supabaseClient.from('exams').select('*'),
                supabaseClient.from('results').select('*')
            ]);
            
            if (uRes.data) users.value = uRes.data;
            if (eRes.data) exams.value = eRes.data;
            if (rRes.data) allResults.value = rRes.data;

            // Đảm bảo luôn có Admin
            if (!users.value.find(u => u.name === 'admin')) {
                await supabaseClient.from('users').insert(FIXED_ACCOUNTS);
                users.value.push(...FIXED_ACCOUNTS);
            }
        };

        // Toast Notification System
        const notification = ref({ show: false, message: '', type: 'success' });
        const showNotify = (msg, type = 'success') => {
            notification.value = { show: true, message: msg, type: type };
            setTimeout(() => { notification.value.show = false; }, 3000);
        };

        onMounted(() => {
            loadData();
            document.addEventListener('visibilitychange', handleVisibilityChange);
        });

        // --- NAVIGATION LOGIC ---
        const switchView = (target) => {
            authForm.value.name = '';
            authForm.value.password = '';
            view.value = target;
        };

        const getRoleName = (role) => role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : 'Học sinh';
        const getRoleBadgeClass = (role) => role === 'admin' ? 'bg-purple-100 text-purple-700' : role === 'teacher' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';

        // --- AUTHENTICATION ---
        const handleRegister = async () => {
            if (!authForm.value.name.trim() || !authForm.value.password.trim()) return showNotify("Vui lòng điền đầy đủ thông tin", "error");
            if (users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase())) return showNotify("Tên người dùng đã tồn tại", "error");
            
            const newUser = { id: Date.now(), name: authForm.value.name, password: authForm.value.password, role: 'student' };
            const { error } = await supabaseClient.from('users').insert([newUser]);
            
            if (!error) {
                users.value.push(newUser);
                showNotify("Đăng ký thành công! Bạn có thể đăng nhập ngay.");
                switchView('login');
            } else showNotify("Lỗi CSDL: " + error.message, "error");
        };

        const handleLogin = () => {
            if (!authForm.value.name.trim() || !authForm.value.password.trim()) return showNotify("Vui lòng nhập tên và mật khẩu", "error");
            const user = users.value.find(u => u.name.toLowerCase() === authForm.value.name.toLowerCase());
            
            if (!user) return showNotify("Tài khoản không tồn tại", "error");
            if (user.password !== authForm.value.password) return showNotify("Mật khẩu không chính xác", "error");
            if (view.value === 'admin-login' && user.role !== 'admin') return showNotify("Bạn không có quyền truy cập quản trị", "error");

            currentUser.value = user;
            showNotify(`Chào mừng ${user.name} đã quay trở lại!`);
            view.value = user.role === 'admin' ? 'admin-dash' : user.role === 'teacher' ? 'teacher-dash' : 'student-dash';
            teacherTab.value = 'exams'; // Mặc định mở tab quản lý đề khi giáo viên login
        };

        const logout = () => {
            if (view.value === 'exam-room' && !confirm("Tiến trình thi sẽ bị hủy. Đăng xuất?")) return;
            view.value = 'login';
            currentUser.value = null;
            clearInterval(timerInterval.value);
        };

        const goHome = () => {
            if (view.value === 'exam-room' && !confirm("Rời khỏi phòng thi?")) return;
            clearInterval(timerInterval.value);
            view.value = currentUser.value.role === 'admin' ? 'admin-dash' : currentUser.value.role === 'teacher' ? 'teacher-dash' : 'student-dash';
        };

        // --- ADMIN FUNCTIONS ---
        const filteredUsers = computed(() => {
            if (!searchUser.value) return users.value;
            return users.value.filter(u => u.name.toLowerCase().includes(searchUser.value.toLowerCase()));
        });

        const openAddModal = () => { newUserData.value = { name: '', password: '', role: 'teacher' }; showAddModal.value = true; };
        const saveNewUser = async () => {
            if (!newUserData.value.name.trim() || !newUserData.value.password.trim()) return showNotify("Vui lòng nhập tên và mật khẩu", "error");
            if (users.value.find(u => u.name.toLowerCase() === newUserData.value.name.toLowerCase())) return showNotify("Tên người dùng đã tồn tại", "error");
            
            const newUser = { id: Date.now(), ...newUserData.value };
            const { error } = await supabaseClient.from('users').insert([newUser]);
            if (!error) { users.value.push(newUser); showAddModal.value = false; showNotify("Đã tạo người dùng mới."); }
        };

        const deleteUser = async (id) => { 
            if (confirm("Xóa tài khoản này?")) {
                const { error } = await supabaseClient.from('users').delete().eq('id', id);
                if (!error) { users.value = users.value.filter(u => u.id !== id); showNotify("Đã xóa tài khoản."); }
            }
        };

        const updateUserRole = async (user, newRole) => { 
            const { error } = await supabaseClient.from('users').update({ role: newRole }).eq('id', user.id);
            if (!error) { user.role = newRole; showNotify("Cập nhật vai trò thành công."); }
        };
        
        const openEditModal = (user) => { editUserData.value = { ...user }; showEditModal.value = true; };
        const saveUserEdit = async () => {
            const { error } = await supabaseClient.from('users').update({ name: editUserData.value.name, password: editUserData.value.password, role: editUserData.value.role }).eq('id', editUserData.value.id);
            if (!error) {
                const index = users.value.findIndex(u => u.id === editUserData.value.id);
                if (index !== -1) users.value[index] = { ...editUserData.value };
                showEditModal.value = false;
                showNotify("Lưu thông tin thành công.");
            }
        };

        // --- TEACHER FUNCTIONS (Exams) ---
        const newExam = ref({ title: '', type: 'quiz', time: 15, questions: [], essayContent: '' });
        
        const addQuestion = () => newExam.value.questions.push({ text: '', options: ['', '', '', ''], correct: 0 });
        const removeQuestion = (idx) => newExam.value.questions.splice(idx, 1);
        
        const saveExam = async () => {
            if (!newExam.value.title) return showNotify("Vui lòng nhập tên bài tập", "error");
            if (newExam.value.type === 'quiz' && newExam.value.questions.length === 0) return showNotify("Cần ít nhất 1 câu hỏi", "error");
            
            const examData = { ...newExam.value, id: Date.now(), creator: currentUser.value.name };
            const { error } = await supabaseClient.from('exams').insert([examData]);
            
            if (!error) {
                exams.value.push(examData);
                newExam.value = { title: '', type: 'quiz', time: 15, questions: [], essayContent: '' };
                showNotify("Đã giao bài thành công!");
                view.value = 'teacher-dash';
                teacherTab.value = 'exams';
            }
        };

        const deleteExam = async (id) => {
            if(confirm("Bạn có chắc muốn xóa đề/bài tập này vĩnh viễn?")) {
                await supabaseClient.from('exams').delete().eq('id', id);
                await supabaseClient.from('results').delete().eq('examId', id);
                exams.value = exams.value.filter(e => e.id !== id);
                allResults.value = allResults.value.filter(r => r.examId !== id);
                showNotify("Đã xóa đề thi.");
            }
        };

        const viewResults = (id) => { currentExam.value = exams.value.find(e => e.id === id); view.value = 'view-results'; };
        const filteredResults = computed(() => allResults.value.filter(r => r.examId === currentExam.value?.id));

        // --- HỆ THỐNG AI VISION & EDGE FUNCTION ---
        
        const handleAiImageUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                aiUploadedImage.value = e.target.result; 
                aiImageBase64.value = e.target.result.split(',')[1]; 
            };
            reader.readAsDataURL(file);
        };

        const handleGenerateAI = async () => {
            if (!aiPrompt.value.trim() && !aiImageBase64.value) {
                return showNotify("Vui lòng tải ảnh lên hoặc nhập chủ đề!", "error");
            }
            
            let selectedTypes = [];
            if(aiMatrix.value.mc) selectedTypes.push("Trắc nghiệm 4 lựa chọn (type: mc)");
            if(aiMatrix.value.tf) selectedTypes.push("Đúng/Sai (type: tf)");
            if(aiMatrix.value.sa) selectedTypes.push("Trả lời ngắn (type: sa)");
            
            if(selectedTypes.length === 0) return showNotify("Vui lòng chọn ít nhất 1 loại câu hỏi ở Ma trận đề!", "error");

            isGenerating.value = true;
            
            try {
                const basePrompt = `Bạn là một giáo viên chuyên gia. Dựa vào ${aiImageBase64.value ? 'bức ảnh đính kèm và ' : ''}yêu cầu sau: "${aiPrompt.value}". Hãy tạo đề thi chứa các loại câu hỏi: ${selectedTypes.join(', ')}. 
                BẮT BUỘC trả về ĐÚNG định dạng mảng JSON (chỉ JSON, không văn bản nào khác) với cấu trúc cho mỗi object:
                {"type": "mc hoặc tf hoặc sa", "question": "nội dung", "options": ["A","B","C","D"] (chỉ dùng cho mc/tf), "correctAnswer": 0 (index đáp án), "explanation": "giải thích"}`;

                const { data, error } = await supabaseClient.functions.invoke('generate-exam', {
                    body: { 
                        prompt: basePrompt, 
                        imageBase64: aiImageBase64.value 
                    }
                });

                // IN RA CONSOLE ĐỂ BẮT LỖI
                console.log("Dữ liệu trả về từ Server:", data); 

                if (error) throw error;
                
                // Nếu Server trả về JSON chứa object error
                if (data && data.error) {
                    throw new Error("Lỗi từ Gemini API: " + (data.error.message || JSON.stringify(data.error)));
                }

                // Nếu data rỗng hoặc mảng candidates không tồn tại
                if (!data || !data.candidates || data.candidates.length === 0) {
                    throw new Error("Google Gemini không trả về dữ liệu hợp lệ. Vui lòng check API Key trên Supabase.");
                }

                let textResponse = data.candidates[0].content.parts[0].text;
                textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                const generatedQuestions = JSON.parse(textResponse);
                
                newExam.value = { 
                    title: 'Đề xuất từ AI', 
                    type: 'quiz', 
                    time: 45, 
                    questions: generatedQuestions, 
                    essayContent: '' 
                };
                
                showNotify("AI đã trích xuất & tạo đề thành công!");
                
                aiPrompt.value = ''; 
                aiUploadedImage.value = null;
                aiImageBase64.value = '';
                view.value = 'create-exam'; 
                
            } catch (err) {
                console.error("Chi tiết lỗi:", err);
                showNotify(err.message || "Lỗi xử lý AI. Vui lòng mở F12 Console để xem chi tiết.", "error");
            } finally {
                isGenerating.value = false;
            }
        };

        // --- GRADING SYSTEM (Chấm bài) ---
        const gradingModal = ref(false);
        const currentGradingResult = ref(null);
        const manualScore = ref(0);

        const openGradingModal = (result) => { 
            currentGradingResult.value = result; 
            manualScore.value = result.score || 0; 
            gradingModal.value = true; 
        };

        const saveManualGrade = async () => {
            const { error } = await supabaseClient.from('results').update({ score: parseFloat(manualScore.value), status: 'graded' }).eq('id', currentGradingResult.value.id);
            if (!error) {
                const idx = allResults.value.findIndex(r => r.id === currentGradingResult.value.id);
                if (idx !== -1) { 
                    allResults.value[idx].score = parseFloat(manualScore.value); 
                    allResults.value[idx].status = 'graded'; 
                }
                gradingModal.value = false;
                showNotify("Đã lưu điểm thành công!");
            }
        };

        // --- STUDENT FUNCTIONS (Làm bài) ---
        const currentExam = ref(null);
        const studentAnswers = ref([]);
        const studentFile = ref(null);
        const timeLeft = ref(0);
        const timerInterval = ref(null);
        const finalResult = ref({ score: 0, correct: 0 });

        const startExam = (exam) => {
            let examCopy = JSON.parse(JSON.stringify(exam));
            if (examCopy.type === 'quiz') {
                examCopy.questions = shuffleArray(examCopy.questions);
                examCopy.questions.forEach(q => {
                    const originalCorrectText = q.options[q.correct];
                    q.options = shuffleArray(q.options);
                    q.correct = q.options.indexOf(originalCorrectText);
                });
                studentAnswers.value = new Array(examCopy.questions.length).fill(null);
            }
            studentFile.value = null; 
            currentExam.value = examCopy; 
            timeLeft.value = examCopy.time * 60;
            cheatWarnings.value = 0; 
            view.value = 'exam-room';
            
            timerInterval.value = setInterval(() => {
                if (timeLeft.value > 0) {
                    timeLeft.value--;
                } else { 
                    showNotify("Hết thời gian làm bài!", "error");
                    submitExam(); 
                }
            }, 1000);
        };

        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) return showNotify("Vui lòng chọn file dưới 5MB", "error");

            const reader = new FileReader();
            reader.onload = (e) => { studentFile.value = e.target.result; };
            reader.readAsDataURL(file);
        };

        const formattedTime = computed(() => {
            const m = Math.floor(timeLeft.value / 60); const s = timeLeft.value % 60;
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        });

        const submitExam = async () => {
            clearInterval(timerInterval.value);
            let resultData = { 
                id: Date.now(), 
                examId: currentExam.value.id, 
                studentName: currentUser.value.name, 
                submittedAt: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'), 
                type: currentExam.value.type 
            };

            if (currentExam.value.type === 'quiz') {
                let correctCount = 0;
                currentExam.value.questions.forEach((q, i) => { if (studentAnswers.value[i] === q.correct) correctCount++; });
                resultData.score = (correctCount / currentExam.value.questions.length) * 10;
                resultData.correct = correctCount; 
                resultData.status = 'graded';
                finalResult.value = { score: resultData.score, correct: correctCount };
            } else {
                resultData.fileData = studentFile.value; 
                resultData.score = 0; 
                resultData.status = 'pending';
            }
            
            const { error } = await supabaseClient.from('results').insert([resultData]);
            if (!error) {
                allResults.value.push(resultData);
                view.value = currentExam.value.type === 'quiz' ? 'result' : 'student-dash';
                showNotify("Nộp bài thành công!");
            } else {
                showNotify("Lỗi nộp bài: " + error.message, "error");
            }
        };

        return {
            view, currentUser, authForm, users, exams, newExam,
            currentExam, studentAnswers, studentFile, timeLeft, formattedTime, finalResult,
            filteredResults, notification, searchUser, showEditModal, editUserData,
            showAddModal, newUserData, cheatWarnings,
            gradingModal, currentGradingResult, manualScore,
            teacherTab, aiPrompt, isGenerating, aiMatrix, aiUploadedImage, 
            handleAiImageUpload, handleGenerateAI, 
            handleLogin, handleRegister, logout, goHome, addQuestion, removeQuestion, saveExam,
            deleteExam, viewResults, startExam, handleFileUpload, submitExam, switchView,
            getRoleName, getRoleBadgeClass, deleteUser, updateUserRole,
            filteredUsers, openEditModal, saveUserEdit,
            openAddModal, saveNewUser, openGradingModal, saveManualGrade
        };
    }
}).mount('#app');