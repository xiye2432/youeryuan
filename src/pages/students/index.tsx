import { useState, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { loadData, saveItem, STORAGE_KEYS } from '../../services/dataService'
import './index.scss'

interface Student {
  id: string
  name: string
  gender?: string
  class?: string
  className?: string
  birthDate?: string
  parent_name?: string
  parentName?: string
  parent_phone?: string
  parentPhone?: string
  avatar?: string
  status?: string
}

export default function Students() {
  const [students, setStudents] = useState<Student[]>([])
  const [searchText, setSearchText] = useState('')
  const [selectedClass, setSelectedClass] = useState('全部')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({
    name: '',
    gender: '男' as '男' | '女',
    class: '',
    birthDate: '',
    parent_name: '',
    parent_phone: ''
  })

  const currentUser = Taro.getStorageSync('kt_current_user') || {}
  const isTeacher = currentUser.role === 'TEACHER'
  const teacherClasses: string[] = currentUser.assignedClasses || []
  const canAddStudent = !isTeacher

  useEffect(() => {
    void loadStudents()
  }, [])

  useDidShow(() => {
    void loadStudents()
  })

  const loadStudents = async () => {
    const localData = await loadData<Student>(STORAGE_KEYS.STUDENTS)
    let filtered = localData
    if (isTeacher && teacherClasses.length > 0) {
      filtered = localData.filter(s => {
        const cls = getStudentClass(s)
        return teacherClasses.includes(cls)
      })
      if (teacherClasses.length === 1) {
        setSelectedClass(teacherClasses[0])
      }
    }
    setStudents(filtered)
  }

  // 获取学生字段（兼容不同字段名）
  const getStudentClass = (s: Student) => s.class || s.className || '未分班'
  const getParentName = (s: Student) => s.parent_name || s.parentName || ''
  const getParentPhone = (s: Student) => s.parent_phone || s.parentPhone || ''

  // 动态获取班级列表（从数据中提取）
  const classList = useMemo(() => {
    const classSet = new Set<string>()
    students.forEach(s => {
      const cls = getStudentClass(s)
      if (cls && cls !== '未分班') {
        classSet.add(cls)
      }
    })
    const sorted = Array.from(classSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    if (isTeacher && teacherClasses.length > 0) {
      return sorted
    }
    return ['全部', ...sorted]
  }, [students])

  // 过滤学生
  const filteredStudents = students.filter(s => {
    const parentName = getParentName(s)
    const phone = getParentPhone(s)
    const matchSearch = !searchText || 
      s.name?.includes(searchText) || 
      parentName.includes(searchText) ||
      phone.includes(searchText)
    const studentClass = getStudentClass(s)
    const matchClass = selectedClass === '全部' || studentClass === selectedClass
    return matchSearch && matchClass
  })

  // 按班级分组
  const groupedStudents = filteredStudents.reduce((acc, student) => {
    const cls = getStudentClass(student)
    if (!acc[cls]) acc[cls] = []
    acc[cls].push(student)
    return acc
  }, {} as Record<string, Student[]>)

  // 班级排序
  const sortedGroups = Object.entries(groupedStudents).sort((a, b) => 
    a[0].localeCompare(b[0], 'zh-CN')
  )

  // 查看/编辑详情
  const viewDetail = (student: Student) => {
    Taro.navigateTo({
      url: `/pages/students/detail?id=${student.id}`
    })
  }

  // 考勤
  const goAttendance = (e: any, student: Student) => {
    e.stopPropagation()
    Taro.navigateTo({
      url: `/pages/students/attendance?id=${student.id}&name=${student.name}&class=${getStudentClass(student)}`
    })
  }

  // 添加学生（本地 + 已配置 Supabase 时同步云端）
  const handleAddStudent = async () => {
    if (!newStudent.name.trim()) {
      Taro.showToast({ title: '请输入学生姓名', icon: 'none' })
      return
    }

    const student: Student = {
      id: `stu_${newStudent.name}_${Date.now()}`,
      name: newStudent.name.trim(),
      gender: newStudent.gender,
      class: newStudent.class || classList[1] || '未分班',
      className: newStudent.class || classList[1] || '未分班',
      birthDate: newStudent.birthDate,
      parent_name: newStudent.parent_name,
      parentName: newStudent.parent_name,
      parent_phone: newStudent.parent_phone,
      parentPhone: newStudent.parent_phone,
      status: '在读'
    }

    const result = await saveItem(STORAGE_KEYS.STUDENTS, student)
    if (!result.success) {
      Taro.showToast({ title: result.error || '保存失败', icon: 'none' })
      return
    }

    const updated = (Taro.getStorageSync(STORAGE_KEYS.STUDENTS) || []) as Student[]
    setStudents(updated)
    setIsAddModalOpen(false)
    setNewStudent({
      name: '',
      gender: '男',
      class: '',
      birthDate: '',
      parent_name: '',
      parent_phone: ''
    })

    Taro.showToast({
      title: result.error || '添加成功',
      icon: result.error ? 'none' : 'success',
    })
  }

  return (
    <View className='students-page'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <View className='search-input'>
          <Text className='icon'>🔍</Text>
          <Input
            placeholder='搜索姓名/家长/电话'
            value={searchText}
            onInput={(e) => setSearchText(e.detail.value)}
          />
        </View>
        {canAddStudent && (
          <View className='add-btn' onClick={() => setIsAddModalOpen(true)}>
            <Text>+</Text>
          </View>
        )}
      </View>

      {/* 班级筛选 - 动态从数据中获取 */}
      <ScrollView className='class-filter' scrollX>
        {classList.map(cls => (
          <View
            key={cls}
            className={`filter-item ${selectedClass === cls ? 'active' : ''}`}
            onClick={() => setSelectedClass(cls)}
          >
            <Text>{cls}</Text>
            {cls !== '全部' && (
              <Text className='count'>
                {students.filter(s => getStudentClass(s) === cls).length}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      {/* 统计 */}
      <View className='stats-bar'>
        <Text>共 {filteredStudents.length} 名学生</Text>
        {selectedClass !== '全部' && (
          <Text className='hint'>点击学生卡片查看详情/编辑</Text>
        )}
      </View>

      {/* 学生列表 */}
      <ScrollView className='student-list' scrollY>
        {selectedClass === '全部' ? (
          // 分组显示
          sortedGroups.map(([cls, stuList]) => (
            <View key={cls} className='class-group'>
              <View className='class-header'>
                <Text className='class-name'>{cls}</Text>
                <Text className='count'>{stuList.length}人</Text>
              </View>
              {stuList.map(student => (
                <View key={student.id} className='student-card' onClick={() => viewDetail(student)}>
                  <View className='avatar'>
                    <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
                  </View>
                  <View className='info'>
                    <Text className='name'>{student.name}</Text>
                    <Text className='meta'>{getParentPhone(student) || '未填电话'}</Text>
                  </View>
                  <View className='arrow'>
                    <Text>›</Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        ) : (
          // 平铺显示
          <View className='flat-list'>
            {filteredStudents.map(student => (
              <View key={student.id} className='student-card' onClick={() => viewDetail(student)}>
                <View className='avatar'>
                  <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
                </View>
                <View className='info'>
                  <Text className='name'>{student.name}</Text>
                  <Text className='meta'>
                    {getParentName(student) || '未填家长'} · {getParentPhone(student) || '未填电话'}
                  </Text>
                </View>
                <View className='actions'>
                  <View className='action-btn' onClick={(e) => goAttendance(e, student)}>
                    <Text>📋</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {filteredStudents.length === 0 && (
          <View className='empty'>
            <Text className='icon'>📭</Text>
            <Text>暂无学生数据</Text>
            <Text className='hint'>请在「我的」页面同步云端数据</Text>
          </View>
        )}
      </ScrollView>

      {/* 添加学生弹窗 */}
      {isAddModalOpen && (
        <View className='modal-overlay' onClick={() => setIsAddModalOpen(false)}>
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>添加学生</Text>
            
            <View className='form-item'>
              <Text className='label'>姓名 *</Text>
              <Input
                placeholder='请输入学生姓名'
                value={newStudent.name}
                onInput={(e) => setNewStudent(prev => ({ ...prev, name: e.detail.value }))}
              />
            </View>

            <View className='form-item'>
              <Text className='label'>性别</Text>
              <View className='gender-options'>
                {['男', '女'].map(g => (
                  <View
                    key={g}
                    className={`gender-btn ${newStudent.gender === g ? 'active' : ''}`}
                    onClick={() => setNewStudent(prev => ({ ...prev, gender: g as '男' | '女' }))}
                  >
                    <Text>{g === '男' ? '👦' : '👧'} {g}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='form-item'>
              <Text className='label'>班级</Text>
              <View className='class-options'>
                {classList.filter(c => c !== '全部').map(c => (
                  <View
                    key={c}
                    className={`class-btn ${newStudent.class === c ? 'active' : ''}`}
                    onClick={() => setNewStudent(prev => ({ ...prev, class: c }))}
                  >
                    <Text>{c}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='form-item'>
              <Text className='label'>家长姓名</Text>
              <Input
                placeholder='请输入家长姓名'
                value={newStudent.parent_name}
                onInput={(e) => setNewStudent(prev => ({ ...prev, parent_name: e.detail.value }))}
              />
            </View>

            <View className='form-item'>
              <Text className='label'>家长电话</Text>
              <Input
                type='number'
                placeholder='请输入家长电话'
                value={newStudent.parent_phone}
                onInput={(e) => setNewStudent(prev => ({ ...prev, parent_phone: e.detail.value }))}
              />
            </View>

            <View className='modal-actions'>
              <View className='btn cancel' onClick={() => setIsAddModalOpen(false)}>
                <Text>取消</Text>
              </View>
              <View className='btn confirm' onClick={handleAddStudent}>
                <Text>确认添加</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
