import { View, Text, Textarea, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useMemo } from 'react'
import {
  isUuid,
  loadData,
  loadStudentEvaluations,
  randomUuidV4,
  STORAGE_KEYS,
  syncStudentEvaluationToCloud,
} from '../../services/dataService'
import './index.scss'

function getEnvVar(key: string, fallback = ''): string {
  try {
    const env = typeof process !== 'undefined' && process?.env ? process.env : undefined
    const value = env?.[key]
    return typeof value === 'string' && value ? value : fallback
  } catch {
    return fallback
  }
}


// 评价等级
const LEVELS = [
  { value: 5, label: '优秀', color: 'level-5' },
  { value: 4, label: '良好', color: 'level-4' },
  { value: 3, label: '一般', color: 'level-3' },
  { value: 2, label: '需加强', color: 'level-2' },
  { value: 1, label: '待发展', color: 'level-1' },
]

// 评价模板
const TEMPLATES = [
  {
    id: 'lang_senior',
    name: '大班阅读、语言能力评价',
    grade: '大班',
    domain: '语言',
    semester: '上学期',
    icon: '📖',
    iconClass: 'lang',
    items: [
      { id: 'l1', name: '认真听并能听懂常用语言' },
      { id: 'l2', name: '能根据指令做出相应反应' },
      { id: 'l3', name: '愿意讲话并能清楚地表达' },
      { id: 'l4', name: '能有序、连贯地讲述事情' },
      { id: 'l5', name: '喜欢听故事、看图书' },
      { id: 'l6', name: '能理解图书内容并讲述' },
      { id: 'l7', name: '对汉字产生兴趣' },
      { id: 'l8', name: '愿意用图画和符号表达想法' },
      { id: 'l9', name: '正确书写自己的名字' },
      { id: 'l10', name: '有良好的阅读习惯' },
    ],
  },
  {
    id: 'art_junior',
    name: '小班幼儿艺术表现能力评价',
    grade: '小班',
    domain: '艺术',
    semester: '上学期',
    icon: '🎨',
    iconClass: 'art',
    items: [
      { id: 'a1', name: '喜欢自然界与生活中美的事物' },
      { id: 'a2', name: '喜欢欣赏多种形式的艺术作品' },
      { id: 'a3', name: '能用自己喜欢的方式进行艺术表现' },
      { id: 'a4', name: '喜欢唱歌并能基本唱准' },
      { id: 'a5', name: '能用身体动作表现音乐节奏' },
      { id: 'a6', name: '喜欢涂涂画画' },
      { id: 'a7', name: '能用简单材料进行手工制作' },
      { id: 'a8', name: '乐于参与集体艺术活动' },
    ],
  },
]

// AI润色API
const polishComment = async (studentName: string, templateName: string, avgScore: number, comment: string) => {
  const apiKey = getEnvVar('TARO_APP_DOUBAO_API_KEY', '')
  if (!apiKey) {
    throw new Error('API Key未配置')
  }


  const prompt = `请帮我润色以下幼儿园教师对学生的发展评价评语，使其更加专业、温暖、具体。

学生姓名：${studentName}
评价类型：${templateName}
平均得分：${avgScore}/5

教师原始评语：
${comment || '（教师未填写评语）'}

要求：
1. 如果原评语为空，请根据评价结果生成一段专业评语
2. 评语要体现对孩子的关爱和鼓励
3. 语言温馨、专业，控制在100-150字

请直接输出润色后的评语。`

  const response = await Taro.request({
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    method: 'POST',
    header: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    data: {
      model: 'doubao-seed-1-6-251015',
      messages: [
        { role: 'system', content: '你是一位专业、温暖的幼儿园教师。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_completion_tokens: 500,
    },
  })

  return response.data?.choices?.[0]?.message?.content?.trim() || comment
}

export default function GrowthPage() {
  const [activeTab, setActiveTab] = useState<'archive' | 'evaluation'>('evaluation')
  const [students, setStudents] = useState<any[]>([])
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [isPolishing, setIsPolishing] = useState(false)
  const [evaluations, setEvaluations] = useState<any[]>([])
  
  // 学生选择相关状态
  const [showStudentPicker, setShowStudentPicker] = useState(false)
  const [selectedClass, setSelectedClass] = useState<string>('全部')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    void loadStudents()
    void loadEvaluations()
  }, [])

  useDidShow(() => {
    void loadStudents()
    void loadEvaluations()
  })

  const loadStudents = async () => {
    const saved = await loadData<any>(STORAGE_KEYS.STUDENTS)
    console.log('[Growth] 加载学生数据:', saved.length, '人')
    setStudents(Array.isArray(saved) ? saved : [])
  }

  const loadEvaluations = async () => {
    const saved = await loadStudentEvaluations()
    setEvaluations(Array.isArray(saved) ? saved : [])
  }

  // 获取班级列表
  const classList = useMemo(() => {
    const classSet = new Set<string>()
    students.forEach(s => {
      const cls = s.class || s.className || '未分班'
      classSet.add(cls)
    })
    return ['全部', ...Array.from(classSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))]
  }, [students])

  // 根据班级和搜索筛选学生
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const cls = s.class || s.className || '未分班'
      const matchClass = selectedClass === '全部' || cls === selectedClass
      const matchSearch = !searchText || s.name?.includes(searchText)
      return matchClass && matchSearch
    })
  }, [students, selectedClass, searchText])

  // 按班级分组
  const groupedStudents = useMemo(() => {
    const groups: Record<string, any[]> = {}
    filteredStudents.forEach(s => {
      const cls = s.class || s.className || '未分班'
      if (!groups[cls]) groups[cls] = []
      groups[cls].push(s)
    })
    return groups
  }, [filteredStudents])

  // 该学生的历史评价
  const studentEvaluations = evaluations.filter(e => e.studentId === selectedStudent?.id)

  // 计算完成进度
  const progress = selectedTemplate 
    ? Math.round((selectedTemplate.items.filter(item => scores[item.id] > 0).length / selectedTemplate.items.length) * 100)
    : 0

  // 选择学生
  const handleSelectStudent = (student: any) => {
    setSelectedStudent(student)
    setShowStudentPicker(false)
    setSearchText('')
  }

  // 选择模板
  const handleSelectTemplate = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template)
    setScores({})
    setComment('')
  }

  // 设置分数
  const handleSetScore = (itemId: string, score: number) => {
    setScores(prev => ({ ...prev, [itemId]: score }))
  }

  // AI润色
  const handlePolish = async () => {
    if (!selectedStudent || !selectedTemplate) return
    
    setIsPolishing(true)
    try {
      const filledScores = selectedTemplate.items.filter(item => scores[item.id] > 0)
      const avgScore = filledScores.length > 0
        ? filledScores.reduce((sum, item) => sum + scores[item.id], 0) / filledScores.length
        : 3
      
      const polished = await polishComment(
        selectedStudent.name,
        selectedTemplate.name,
        Math.round(avgScore * 10) / 10,
        comment
      )
      setComment(polished)
      Taro.showToast({ title: '润色完成', icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error.message || 'AI润色失败', icon: 'none' })
    } finally {
      setIsPolishing(false)
    }
  }

  // 保存评价
  const handleSave = async (status: 'draft' | 'completed') => {
    if (!selectedStudent || !selectedTemplate) return
    if (status === 'completed' && progress < 100) {
      Taro.showToast({ title: '请完成所有评价项', icon: 'none' })
      return
    }

    const evalScores = selectedTemplate.items.map(item => ({
      itemId: item.id,
      itemName: item.name,
      score: scores[item.id] || 0,
    }))

    const filledScores = evalScores.filter(s => s.score > 0)
    const totalScore = filledScores.reduce((sum, s) => sum + s.score, 0)
    const avgScore = filledScores.length > 0 ? totalScore / filledScores.length : 0

    const prevDraft = evaluations.find(
      e =>
        e.studentId === selectedStudent.id &&
        e.templateId === selectedTemplate.id &&
        e.status === 'draft'
    )
    const id = prevDraft && isUuid(prevDraft.id) ? prevDraft.id : randomUuidV4()

    const evaluation = {
      id,
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      studentClass: selectedStudent.class || selectedStudent.className,
      campus: selectedStudent.campus,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      grade: selectedTemplate.grade,
      domain: selectedTemplate.domain,
      semester: selectedTemplate.semester,
      schoolYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      scores: evalScores,
      totalScore,
      averageScore: Math.round(avgScore * 10) / 10,
      teacherComment: comment,
      evaluatedBy: '教师',
      evaluatedAt: new Date().toISOString(),
      status,
      progress,
    }

    // 保存
    const updated = [...evaluations.filter(e => 
      !(e.studentId === selectedStudent.id && e.templateId === selectedTemplate.id && e.status === 'draft')
    ), evaluation]
    
    setEvaluations(updated)
    Taro.setStorageSync(STORAGE_KEYS.STUDENT_EVALUATIONS, updated)

    const sync = await syncStudentEvaluationToCloud(evaluation)
    if (!sync.success) {
      Taro.showToast({ title: sync.error || '保存失败', icon: 'none' })
      return
    }

    if (status === 'completed') {
      Taro.showToast({ title: sync.error || '评价已保存', icon: sync.error ? 'none' : 'success' })
      setSelectedTemplate(null)
      setScores({})
      setComment('')
    } else {
      Taro.showToast({ title: sync.error || '草稿已保存', icon: sync.error ? 'none' : 'success' })
    }
  }

  return (
    <View className="growth-page">
      <View className="header">
        <Text className="title">成长档案</Text>
        <Text className="subtitle">发展评价 · 在线填写</Text>
      </View>

      {/* 标签页 */}
      <View className="tabs">
        <View 
          className={`tab ${activeTab === 'archive' ? 'active' : ''}`}
          onClick={() => setActiveTab('archive')}
        >
          📄 成长档案
        </View>
        <View 
          className={`tab ${activeTab === 'evaluation' ? 'active' : ''}`}
          onClick={() => setActiveTab('evaluation')}
        >
          ✅ 发展评价
        </View>
      </View>

      {/* 学生选择器 - 点击弹出选择面板 */}
      <View className="student-selector" onClick={() => setShowStudentPicker(true)}>
        <View className="picker-box">
          <Text className="label">选择学生</Text>
          <Text className="value">
            {selectedStudent 
              ? `${selectedStudent.name} - ${selectedStudent.class || selectedStudent.className}` 
              : '点击选择学生'}
          </Text>
          <Text className="arrow">▼</Text>
        </View>
      </View>

      {/* 学生选择弹窗 */}
      {showStudentPicker && (
        <View className="student-picker-modal">
          <View className="picker-overlay" onClick={() => setShowStudentPicker(false)} />
          <View className="picker-content">
            <View className="picker-header">
              <Text className="picker-title">选择学生</Text>
              <Text className="picker-close" onClick={() => setShowStudentPicker(false)}>✕</Text>
            </View>
            
            {/* 搜索框 */}
            <View className="search-box">
              <Text className="search-icon">🔍</Text>
              <Input
                className="search-input"
                placeholder="搜索学生姓名"
                value={searchText}
                onInput={e => setSearchText(e.detail.value)}
              />
              {searchText && (
                <Text className="clear-btn" onClick={() => setSearchText('')}>✕</Text>
              )}
            </View>
            
            {/* 班级筛选 */}
            <ScrollView className="class-tabs" scrollX>
              {classList.map(cls => (
                <View
                  key={cls}
                  className={`class-tab ${selectedClass === cls ? 'active' : ''}`}
                  onClick={() => setSelectedClass(cls)}
                >
                  <Text>{cls}</Text>
                  {cls !== '全部' && (
                    <Text className="count">
                      {students.filter(s => (s.class || s.className || '未分班') === cls).length}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
            
            {/* 学生列表 */}
            <ScrollView className="student-list" scrollY>
              {selectedClass === '全部' ? (
                // 按班级分组显示
                Object.entries(groupedStudents).map(([cls, stuList]) => (
                  <View key={cls} className="class-group">
                    <View className="group-header">
                      <Text className="group-name">{cls}</Text>
                      <Text className="group-count">{stuList.length}人</Text>
                    </View>
                    {stuList.map(student => (
                      <View
                        key={student.id}
                        className={`student-item ${selectedStudent?.id === student.id ? 'selected' : ''}`}
                        onClick={() => handleSelectStudent(student)}
                      >
                        <View className="student-avatar">
                          <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
                        </View>
                        <Text className="student-name">{student.name}</Text>
                        {selectedStudent?.id === student.id && (
                          <Text className="check-mark">✓</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                // 直接显示筛选后的学生
                <View className="flat-list">
                  {filteredStudents.map(student => (
                    <View
                      key={student.id}
                      className={`student-item ${selectedStudent?.id === student.id ? 'selected' : ''}`}
                      onClick={() => handleSelectStudent(student)}
                    >
                      <View className="student-avatar">
                        <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
                      </View>
                      <Text className="student-name">{student.name}</Text>
                      {selectedStudent?.id === student.id && (
                        <Text className="check-mark">✓</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
              
              {filteredStudents.length === 0 && (
                <View className="empty-tip">
                  <Text>暂无学生数据</Text>
                  <Text className="hint">请先在「我的」页面同步数据</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {!selectedStudent ? (
        <View className="empty-state">
          <Text className="icon">👶</Text>
          <Text className="text">请先选择一位学生</Text>
        </View>
      ) : activeTab === 'evaluation' ? (
        !selectedTemplate ? (
          <>
            {/* 当前选中的学生信息 */}
            <View className="selected-student-card">
              <View className="student-avatar large">
                <Text>{selectedStudent.gender === '女' ? '👧' : '👦'}</Text>
              </View>
              <View className="student-info">
                <Text className="name">{selectedStudent.name}</Text>
                <Text className="class">{selectedStudent.class || selectedStudent.className}</Text>
              </View>
              <View className="change-btn" onClick={() => setShowStudentPicker(true)}>
                <Text>换一个</Text>
              </View>
            </View>

            {/* 评价模板列表 */}
            <View className="template-list">
              <Text className="section-title">📋 选择评价模板</Text>
              {TEMPLATES.map(template => (
                <View 
                  key={template.id} 
                  className="template-card"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <View className="template-header">
                    <View className={`icon-box ${template.iconClass}`}>
                      <Text className="icon">{template.icon}</Text>
                    </View>
                    <View className="info">
                      <Text className="name">{template.name}</Text>
                      <Text className="meta">{template.grade} · {template.domain} · {template.semester}</Text>
                    </View>
                  </View>
                  <Text className="item-count">共 {template.items.length} 项评价指标</Text>
                </View>
              ))}
            </View>

            {/* 历史评价 */}
            {studentEvaluations.length > 0 && (
              <View className="history-list">
                <Text className="section-title">📝 历史评价记录</Text>
                {studentEvaluations.map(ev => (
                  <View key={ev.id} className="history-card">
                    <View className="card-header">
                      <Text className="template-name">{ev.templateName}</Text>
                      <Text className="date">{new Date(ev.evaluatedAt).toLocaleDateString()}</Text>
                    </View>
                    <View className="score-row">
                      <Text className="avg-score">{ev.averageScore}</Text>
                      <View className="score-bar">
                        <View className="bar" style={{ width: `${(ev.averageScore / 5) * 100}%` }} />
                      </View>
                    </View>
                    {ev.teacherComment && (
                      <Text className="comment">"{ev.teacherComment}"</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          /* 评价表单 */
          <View className="evaluation-form">
            <View className="form-header">
              <View className="back-btn" onClick={() => setSelectedTemplate(null)}>
                ← 返回
              </View>
              <Text className="template-name">{selectedTemplate.name}</Text>
            </View>

            {/* 当前学生 */}
            <View className="current-student">
              <Text>正在评价: </Text>
              <Text className="name">{selectedStudent.name}</Text>
            </View>

            {/* 进度条 */}
            <View className="progress-bar">
              <View className="progress" style={{ width: `${progress}%` }} />
            </View>
            <Text className="progress-text">完成进度: {progress}%</Text>

            {/* 评价项目 */}
            {selectedTemplate.items.map((item, idx) => (
              <View key={item.id} className="eval-item">
                <Text className="item-title">{idx + 1}. {item.name}</Text>
                <View className="score-btns">
                  {LEVELS.map(level => (
                    <View
                      key={level.value}
                      className={`score-btn ${scores[item.id] === level.value ? `selected ${level.color}` : ''}`}
                      onClick={() => handleSetScore(item.id, level.value)}
                    >
                      {level.label}
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* 教师评语 */}
            <View className="comment-section">
              <View className="comment-header">
                <Text className="label">教师评语</Text>
                <View 
                  className={`ai-btn ${isPolishing ? 'loading' : ''}`}
                  onClick={handlePolish}
                >
                  {isPolishing ? '⏳ 润色中...' : '✨ AI润色'}
                </View>
              </View>
              <Textarea
                className="comment-input"
                value={comment}
                onInput={e => setComment(e.detail.value)}
                placeholder="输入评语或点击AI润色自动生成..."
                maxlength={500}
              />
              {isPolishing && (
                <Text className="ai-hint">AI正在根据评价结果生成专业评语...</Text>
              )}
            </View>

            {/* 操作按钮 */}
            <View className="form-actions">
              <View className="btn draft" onClick={() => handleSave('draft')}>
                保存草稿
              </View>
              <View 
                className={`btn submit ${progress < 100 ? 'disabled' : ''}`}
                onClick={() => handleSave('completed')}
              >
                完成评价
              </View>
            </View>
          </View>
        )
      ) : (
        /* 成长档案 */
        <View className="empty-state">
          <Text className="icon">📄</Text>
          <Text className="text">成长档案功能开发中...</Text>
        </View>
      )}
    </View>
  )
}
