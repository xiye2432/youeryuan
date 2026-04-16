import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { loadAttendanceData, loadData, saveAttendanceData, STORAGE_KEYS } from '../../services/dataService'

import './attendance.scss'

interface Student {
  id: string
  name: string
  class: string
}

type AttendanceStatus = 'present' | 'absent' | 'sick' | 'leave' | 'other'

interface AttendanceRecord {
  studentId: string
  status: AttendanceStatus
  time?: string
  notes?: string
}

const BATCH_STATUS_OPTIONS = ['present', 'absent', 'sick', 'other'] as const

export default function Attendance() {
  const router = useRouter()
  const { id, name, class: studentClass } = router.params

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [students, setStudents] = useState<Student[]>([])
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord>>({})

  // 单个学生考勤
  const [singleStatus, setSingleStatus] = useState<'present' | 'absent' | 'sick' | 'leave'>('present')
  const [singleNotes, setSingleNotes] = useState('')

  useEffect(() => {
    void loadPageData()
  }, [selectedDate, id, name, studentClass])

  const getScopedStudents = (data: Student[]) => {
    if (studentClass) {
      return data.filter((s: Student) => s.class === studentClass)
    }
    const currentUser = Taro.getStorageSync('kt_current_user') || {}
    const isTeacher = currentUser.role === 'TEACHER'
    const teacherClasses: string[] = currentUser.assignedClasses || []
    if (isTeacher && teacherClasses.length > 0) {
      return data.filter((s: Student) => teacherClasses.includes(s.class))
    }
    return data
  }

  const initializeBatchAttendance = (
    scopedStudents: Student[],
    existingData: Record<string, AttendanceRecord>
  ) => {
    const mergedData = { ...existingData }
    let changed = false

    scopedStudents.forEach((student) => {
      if (!mergedData[student.id]) {
        mergedData[student.id] = {
          studentId: student.id,
          status: 'present',
          time: new Date().toISOString(),
          notes: ''
        }
        changed = true
      }
    })

    return { mergedData, changed }
  }

  const loadPageData = async () => {
    const allStudents = await loadData<Student>(STORAGE_KEYS.STUDENTS)
    const scopedStudents = getScopedStudents(allStudents)
    setStudents(scopedStudents)

    const data = await loadAttendanceData(selectedDate)

    if (id && name) {
      setAttendanceData(data)
      if (data[id]) {
        setSingleStatus(data[id].status === 'other' ? 'leave' : data[id].status)
        setSingleNotes(data[id].notes || '')
      } else {
        setSingleStatus('present')
        setSingleNotes('')
      }
      return
    }

    const { mergedData, changed } = initializeBatchAttendance(scopedStudents, data)
    setAttendanceData(mergedData)

    if (changed) {
      Taro.setStorageSync(`kt_attendance_${selectedDate}`, mergedData)
    }
  }

  const saveAttendance = async (studentId: string, record: AttendanceRecord) => {
    const result = await saveAttendanceData(selectedDate, studentId, record)
    const data = Taro.getStorageSync(`kt_attendance_${selectedDate}`) || {}
    setAttendanceData(data)
    if (result.error) {
      console.log('同步考勤失败:', result.error)
    }
  }

  // 单个学生提交
  const handleSingleSubmit = () => {
    if (!id) return

    const record: AttendanceRecord = {
      studentId: id,
      status: singleStatus,
      time: new Date().toISOString(),
      notes: singleNotes
    }

    saveAttendance(id, record)
    Taro.showToast({ title: '考勤已记录', icon: 'success' })

    setTimeout(() => {
      Taro.navigateBack()
    }, 1500)
  }

  // 批量更新
  const updateBatchStatus = (studentId: string, status: 'present' | 'absent' | 'sick' | 'other') => {
    const currentRecord = attendanceData[studentId]
    const record: AttendanceRecord = {
      studentId,
      status,
      time: new Date().toISOString(),
      notes: status === 'other' ? (currentRecord?.notes || '') : ''
    }
    void saveAttendance(studentId, record)
  }

  const updateBatchNotes = (studentId: string, notes: string) => {
    const currentRecord = attendanceData[studentId]
    const record: AttendanceRecord = {
      studentId,
      status: 'other',
      time: new Date().toISOString(),
      notes
    }

    if (currentRecord?.status !== 'other' || currentRecord?.notes !== notes) {
      void saveAttendance(studentId, record)
    }
  }

  // 全部出勤
  const markAllPresent = () => {
    Taro.showModal({
      title: '恢复全班全勤',
      content: `确认将${studentClass || '全部'}班级恢复为默认全勤？`,
      success: (res) => {
        if (res.confirm) {
          students.forEach(student => {
            void saveAttendance(student.id, {
              studentId: student.id,
              status: 'present',
              time: new Date().toISOString(),
              notes: ''
            })
          })

          Taro.showToast({ title: '已恢复默认全勤', icon: 'success' })
        }
      }
    })
  }

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      present: '✅',
      absent: '❌',
      sick: '🏥',
      leave: '📝',
      other: '📝'
    }
    return icons[status] || '⏳'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      present: '出勤',
      absent: '缺勤',
      sick: '病假',
      leave: '事假',
      other: '其他'
    }
    return labels[status] || '未记录'
  }

  // 按班级分组
  const groupedStudents = students.reduce((acc, student) => {
    const cls = student.class || '未分班'
    if (!acc[cls]) acc[cls] = []
    acc[cls].push(student)
    return acc
  }, {} as Record<string, Student[]>)

  const scopedRecords = students
    .map(student => attendanceData[student.id])
    .filter((record): record is AttendanceRecord => !!record)

  // 统计
  const stats = {
    total: students.length,
    present: scopedRecords.filter(r => r.status === 'present').length,
    absent: scopedRecords.filter(r => r.status === 'absent').length,
    sick: scopedRecords.filter(r => r.status === 'sick').length,
    other: scopedRecords.filter(r => r.status === 'other' || r.status === 'leave').length,
    unrecorded: students.length - scopedRecords.length
  }

  // 如果是单个学生模式
  if (id && name) {
    return (
      <View className='attendance-page'>
        <View className='single-mode'>
          <View className='student-info'>
            <Text className='name'>{decodeURIComponent(name)}</Text>
            <Text className='class'>{decodeURIComponent(studentClass || '')}</Text>
          </View>

          <View className='date-picker'>
            <Picker mode='date' value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
              <View className='picker-content'>
                <Text className='label'>日期</Text>
                <Text className='value'>{selectedDate}</Text>
              </View>
            </Picker>
          </View>

          <View className='status-options'>
            <Text className='section-title'>考勤状态</Text>
            {(['present', 'absent', 'sick', 'leave'] as const).map(status => (
              <View
                key={status}
                className={`status-option ${singleStatus === status ? 'active' : ''}`}
                onClick={() => setSingleStatus(status)}
              >
                <Text className='icon'>{getStatusIcon(status)}</Text>
                <Text className='label'>{getStatusLabel(status)}</Text>
                {singleStatus === status && <Text className='check'>✓</Text>}
              </View>
            ))}
          </View>

          <View className='notes-section'>
            <Text className='section-title'>备注说明</Text>
            <Input
              className='notes-input'
              placeholder='可填写原因或备注'
              value={singleNotes}
              onInput={(e) => setSingleNotes(e.detail.value)}
            />
          </View>

          <View className='submit-btn' onClick={handleSingleSubmit}>
            <Text>提交考勤</Text>
          </View>
        </View>
      </View>
    )
  }

  // 批量考勤模式
  return (
    <View className='attendance-page'>
      {/* 日期选择 */}
      <View className='header'>
        <Picker mode='date' value={selectedDate} onChange={(e) => setSelectedDate(e.detail.value)}>
          <View className='date-display'>
            <Text className='date'>{selectedDate}</Text>
            <Text className='arrow'>▼</Text>
          </View>
        </Picker>

        <View className='quick-btn' onClick={markAllPresent}>
          <Text>✅ 恢复全勤</Text>
        </View>
      </View>

      <View className='batch-hint'>
        <Text>已默认勾选全班全勤，如有异常请手动改为缺勤、病假或其他并填写备注。</Text>
      </View>

      {/* 统计栏 */}
      <View className='stats-bar'>
        <View className='stat-item'>
          <Text className='number'>{stats.present}</Text>
          <Text className='label'>出勤</Text>
        </View>
        <View className='stat-item'>
          <Text className='number red'>{stats.absent}</Text>
          <Text className='label'>缺勤</Text>
        </View>
        <View className='stat-item'>
          <Text className='number orange'>{stats.sick}</Text>
          <Text className='label'>病假</Text>
        </View>
        <View className='stat-item'>
          <Text className='number blue'>{stats.other}</Text>
          <Text className='label'>其他</Text>
        </View>
        <View className='stat-item'>
          <Text className='number gray'>{stats.unrecorded}</Text>
          <Text className='label'>未记录</Text>
        </View>
      </View>

      {/* 学生列表 */}
      <ScrollView className='student-list' scrollY>
        {Object.entries(groupedStudents).map(([cls, stuList]) => (
          <View key={cls} className='class-group'>
            <View className='class-header'>
              <Text className='class-name'>{cls}</Text>
              <Text className='count'>{stuList.length}人</Text>
            </View>

            {stuList.map(student => {
              const record = attendanceData[student.id]
              const currentStatus = record?.status || 'present'

              return (
                <View key={student.id} className='student-row'>
                  <View className='student-main'>
                    <View className='student-info'>
                      <Text className='name'>{student.name}</Text>
                      <Text className={`current-status ${currentStatus}`}>
                        {getStatusIcon(currentStatus)} {getStatusLabel(currentStatus)}
                      </Text>
                    </View>

                    <View className='status-btns'>
                      {BATCH_STATUS_OPTIONS.map(status => (
                        <View
                          key={status}
                          className={`status-btn ${status} ${currentStatus === status ? 'active' : ''}`}
                          onClick={() => updateBatchStatus(student.id, status)}
                        >
                          <Text>{getStatusIcon(status)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {currentStatus === 'other' && (
                    <View className='other-notes'>
                      <Text className='note-label'>备注</Text>
                      <Input
                        className='note-input'
                        placeholder='请输入其他情况说明'
                        value={record?.notes || ''}
                        onInput={(e) => updateBatchNotes(student.id, e.detail.value)}
                      />
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
