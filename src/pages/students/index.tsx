import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { loadData, saveItem, STORAGE_KEYS } from '../../services/dataService'
import {
  getAssignedClasses,
  getCurrentUser,
  isAdmin,
  isTeacher,
  redirectToProfileSetupIfNeeded,
} from '../../utils/userAccess'
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
  campus?: string
}

const getStudentClass = (student: Student) => student.class || student.className || '未分班'
const getParentName = (student: Student) => student.parent_name || student.parentName || ''
const getParentPhone = (student: Student) => student.parent_phone || student.parentPhone || ''

export default function Students() {
  const currentUser = getCurrentUser()
  const teacherRole = isTeacher(currentUser)
  const adminRole = isAdmin(currentUser)
  const assignedClasses = getAssignedClasses(currentUser)

  const [students, setStudents] = useState<Student[]>([])
  const [searchText, setSearchText] = useState('')
  const [selectedClass, setSelectedClass] = useState(teacherRole && assignedClasses[0] ? assignedClasses[0] : '全部')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({
    name: '',
    gender: '男' as '男' | '女',
    class: teacherRole ? assignedClasses[0] || '' : '',
    birthDate: '',
    parent_name: '',
    parent_phone: '',
  })

  useEffect(() => {
    void loadStudents()
  }, [])

  useDidShow(() => {
    if (redirectToProfileSetupIfNeeded('students')) return
    void loadStudents()
  })

  const loadStudents = async () => {
    const scopedByClass = teacherRole && assignedClasses.length > 0
    const list = await loadData<Student>(STORAGE_KEYS.STUDENTS, {
      campus: adminRole || scopedByClass ? undefined : currentUser?.campus,
    })
    const visibleStudents = teacherRole && assignedClasses.length
      ? list.filter((student) => assignedClasses.includes(getStudentClass(student)))
      : list

    setStudents(visibleStudents)

    if (teacherRole && assignedClasses[0]) {
      setSelectedClass(assignedClasses[0])
      setNewStudent((prev) => ({
        ...prev,
        class: assignedClasses[0],
      }))
    }
  }

  const classList = useMemo(() => {
    if (teacherRole && assignedClasses.length) {
      return assignedClasses
    }

    const set = new Set<string>()
    students.forEach((student) => {
      const className = getStudentClass(student)
      if (className && className !== '未分班') {
        set.add(className)
      }
    })
    return ['全部', ...Array.from(set).filter(Boolean)]
  }, [assignedClasses, students, teacherRole])

  const filteredStudents = students.filter((student) => {
    const matchKeyword = !searchText
      || student.name.includes(searchText)
      || getParentName(student).includes(searchText)
      || getParentPhone(student).includes(searchText)

    const matchClass = teacherRole
      ? assignedClasses.includes(getStudentClass(student))
      : selectedClass === '全部' || getStudentClass(student) === selectedClass

    return matchKeyword && matchClass
  })

  const groupedStudents = filteredStudents.reduce((acc, student) => {
    const className = getStudentClass(student)
    if (!acc[className]) acc[className] = []
    acc[className].push(student)
    return acc
  }, {} as Record<string, Student[]>)

  const sortedGroups = Object.entries(groupedStudents).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))

  const handleAddStudent = async () => {
    if (teacherRole) {
      Taro.showToast({ title: '教师账号不能新增学生', icon: 'none' })
      return
    }

    if (!newStudent.name.trim()) {
      Taro.showToast({ title: '请输入学生姓名', icon: 'none' })
      return
    }

    const className = newStudent.class || classList.find((item) => item !== '全部') || '未分班'
    const student: Student = {
      id: `stu_${Date.now()}`,
      name: newStudent.name.trim(),
      gender: newStudent.gender,
      class: className,
      className,
      birthDate: newStudent.birthDate,
      parent_name: newStudent.parent_name,
      parentName: newStudent.parent_name,
      parent_phone: newStudent.parent_phone,
      parentPhone: newStudent.parent_phone,
      status: '在读',
      campus: currentUser?.campus,
    }

    const result = await saveItem(STORAGE_KEYS.STUDENTS, student)
    if (!result.success) {
      Taro.showToast({ title: result.error || '保存失败', icon: 'none' })
      return
    }

    setIsAddModalOpen(false)
    setNewStudent({
      name: '',
      gender: '男',
      class: '',
      birthDate: '',
      parent_name: '',
      parent_phone: '',
    })
    await loadStudents()
    Taro.showToast({ title: '添加成功', icon: 'success' })
  }

  const viewDetail = (student: Student) => {
    Taro.navigateTo({
      url: `/pages/students/detail?id=${student.id}`,
    })
  }

  const goAttendance = (event: any, student: Student) => {
    event.stopPropagation()
    Taro.navigateTo({
      url: `/pages/students/attendance?id=${student.id}&name=${student.name}&class=${getStudentClass(student)}`,
    })
  }

  return (
    <View className='students-page'>
      <View className='search-bar'>
        <View className='search-input'>
          <Text className='icon'>🔍</Text>
          <Input
            placeholder={teacherRole ? '搜索本班学生/家长/电话' : '搜索学生/家长/电话'}
            value={searchText}
            onInput={(e) => setSearchText(e.detail.value)}
          />
        </View>
        {!teacherRole && (
          <View className='add-btn' onClick={() => setIsAddModalOpen(true)}>
            <Text>+</Text>
          </View>
        )}
      </View>

      <ScrollView className='class-filter' scrollX>
        {classList.map((className) => (
          <View
            key={className}
            className={`filter-item ${selectedClass === className ? 'active' : ''}`}
            onClick={() => setSelectedClass(className)}
          >
            <Text>{className}</Text>
            {className !== '全部' && (
              <Text className='count'>{students.filter((student) => getStudentClass(student) === className).length}</Text>
            )}
          </View>
        ))}
      </ScrollView>

      <View className='stats-bar'>
        <Text>{teacherRole ? `本班共 ${filteredStudents.length} 名学生` : `共 ${filteredStudents.length} 名学生`}</Text>
        <Text className='hint'>{teacherRole ? '教师账号仅显示本班数据' : '点击学生卡片查看详情'}</Text>
      </View>

      <ScrollView className='student-list' scrollY>
        {(teacherRole || selectedClass === '全部') ? (
          sortedGroups.map(([className, studentList]) => (
            <View key={className} className='class-group'>
              <View className='class-header'>
                <Text className='class-name'>{className}</Text>
                <Text className='count'>{studentList.length}人</Text>
              </View>
              {studentList.map((student) => (
                <View key={student.id} className='student-card' onClick={() => viewDetail(student)}>
                  <View className='avatar'>
                    <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
                  </View>
                  <View className='info'>
                    <Text className='name'>{student.name}</Text>
                    <Text className='meta'>{getParentName(student) || '未填家长'} · {getParentPhone(student) || '未填电话'}</Text>
                  </View>
                  <View className='actions'>
                    <View className='action-btn' onClick={(event) => goAttendance(event, student)}>
                      <Text>📝</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        ) : (
          <View className='flat-list'>
            {filteredStudents.map((student) => (
              <View key={student.id} className='student-card' onClick={() => viewDetail(student)}>
                <View className='avatar'>
                  <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
                </View>
                <View className='info'>
                  <Text className='name'>{student.name}</Text>
                  <Text className='meta'>{getParentName(student) || '未填家长'} · {getParentPhone(student) || '未填电话'}</Text>
                </View>
                <View className='actions'>
                  <View className='action-btn' onClick={(event) => goAttendance(event, student)}>
                    <Text>📝</Text>
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
            <Text className='hint'>请先同步数据或检查班级设置</Text>
          </View>
        )}
      </ScrollView>

      {isAddModalOpen && (
        <View className='modal-overlay' onClick={() => setIsAddModalOpen(false)}>
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>添加学生</Text>

            <View className='form-item'>
              <Text className='label'>姓名 *</Text>
              <Input value={newStudent.name} onInput={(e) => setNewStudent((prev) => ({ ...prev, name: e.detail.value }))} />
            </View>

            <View className='form-item'>
              <Text className='label'>性别</Text>
              <View className='gender-options'>
                {['男', '女'].map((gender) => (
                  <View
                    key={gender}
                    className={`gender-btn ${newStudent.gender === gender ? 'active' : ''}`}
                    onClick={() => setNewStudent((prev) => ({ ...prev, gender: gender as '男' | '女' }))}
                  >
                    <Text>{gender}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='form-item'>
              <Text className='label'>班级</Text>
              <View className='class-options'>
                {classList.filter((item) => item !== '全部').map((className) => (
                  <View
                    key={className}
                    className={`class-btn ${newStudent.class === className ? 'active' : ''}`}
                    onClick={() => setNewStudent((prev) => ({ ...prev, class: className }))}
                  >
                    <Text>{className}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='form-item'>
              <Text className='label'>家长姓名</Text>
              <Input value={newStudent.parent_name} onInput={(e) => setNewStudent((prev) => ({ ...prev, parent_name: e.detail.value }))} />
            </View>

            <View className='form-item'>
              <Text className='label'>家长电话</Text>
              <Input type='number' value={newStudent.parent_phone} onInput={(e) => setNewStudent((prev) => ({ ...prev, parent_phone: e.detail.value }))} />
            </View>

            <View className='modal-actions'>
              <View className='btn cancel' onClick={() => setIsAddModalOpen(false)}>
                <Text>取消</Text>
              </View>
              <View className='btn confirm' onClick={() => void handleAddStudent()}>
                <Text>确认添加</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
