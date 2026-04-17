import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { deleteItem, saveItem, STORAGE_KEYS } from '../../services/dataService'
import {
  canAccessClass,
  getAssignedClasses,
  getCurrentUser,
  getPaymentClassName,
  isTeacher,
  redirectToProfileSetupIfNeeded,
} from '../../utils/userAccess'
import './detail.scss'

interface Student {
  id: string
  name: string
  gender?: string
  class?: string
  className?: string
  birthDate?: string
  height?: number
  weight?: number
  bloodType?: string
  allergies?: string
  parent_name?: string
  parentName?: string
  parent_relation?: string
  parent_phone?: string
  parentPhone?: string
  address?: string
  status?: string
}

interface AttendanceRecord {
  date: string
  status: 'present' | 'absent' | 'sick' | 'leave'
  notes?: string
}

const getClass = (student: Student) => student.class || student.className || ''
const getParentName = (student: Student) => student.parent_name || student.parentName || ''
const getParentPhone = (student: Student) => student.parent_phone || student.parentPhone || ''

export default function StudentDetail() {
  const router = useRouter()
  const { id } = router.params

  const currentUser = getCurrentUser()
  const teacherRole = isTeacher(currentUser)

  const [student, setStudent] = useState<Student | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Student>>({})
  const [activeTab, setActiveTab] = useState<'info' | 'attendance' | 'payment'>('info')
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [payments, setPayments] = useState<any[]>([])

  useEffect(() => {
    if (redirectToProfileSetupIfNeeded('student-detail')) return
    loadStudent()
    loadAttendance()
    loadPayments()
  }, [id])

  const loadStudent = () => {
    const students = Taro.getStorageSync(STORAGE_KEYS.STUDENTS) || []
    const found = students.find((item: Student) => item.id === id)
    if (!found) return

    if (!canAccessClass(currentUser, getClass(found))) {
      Taro.showToast({ title: '只能查看本班学生信息', icon: 'none' })
      setTimeout(() => {
        Taro.navigateBack({ fail: () => Taro.switchTab({ url: '/pages/students/index' }) })
      }, 300)
      return
    }

    setStudent(found)
    setEditForm(found)
  }

  const loadAttendance = () => {
    const records: AttendanceRecord[] = []
    const today = new Date()

    for (let i = 0; i < 30; i += 1) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const dayRecords = Taro.getStorageSync(`kt_attendance_${dateStr}`) || {}
      if (dayRecords[id!]) {
        records.push({
          date: dateStr,
          status: dayRecords[id!].status,
          notes: dayRecords[id!].notes,
        })
      }
    }

    setAttendanceRecords(records)
  }

  const loadPayments = () => {
    const allPayments = Taro.getStorageSync(STORAGE_KEYS.PAYMENTS) || []
    const studentPayments = allPayments.filter((payment: any) => payment.studentId === id)
    setPayments(studentPayments)
  }

  const canEditStudent = !teacherRole || canAccessClass(currentUser, getClass(student || {} as Student))

  const handleSave = async () => {
    if (!canEditStudent) {
      Taro.showToast({ title: '只能编辑本班学生', icon: 'none' })
      return
    }

    if (!editForm.name?.trim()) {
      Taro.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }

    const merged: Student = {
      ...(student as Student),
      ...editForm,
      id: id!,
      class: editForm.class,
      className: editForm.class,
      parent_name: editForm.parent_name,
      parentName: editForm.parent_name,
      parent_phone: editForm.parent_phone,
      parentPhone: editForm.parent_phone,
    }

    const result = await saveItem(STORAGE_KEYS.STUDENTS, merged)
    if (!result.success) {
      Taro.showToast({ title: result.error || '保存失败', icon: 'none' })
      return
    }

    setStudent(merged)
    setIsEditing(false)
    Taro.showToast({ title: '保存成功', icon: 'success' })
  }

  const handleDelete = () => {
    if (teacherRole) {
      Taro.showToast({ title: '教师账号不能删除学生', icon: 'none' })
      return
    }

    Taro.showModal({
      title: '确认删除',
      content: `确定删除学生 ${student?.name} 吗？`,
      success: async (res) => {
        if (!res.confirm) return
        const result = await deleteItem(STORAGE_KEYS.STUDENTS, id!)
        if (!result.success) {
          Taro.showToast({ title: result.error || '删除失败', icon: 'none' })
          return
        }
        Taro.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => {
          Taro.navigateBack()
        }, 300)
      },
    })
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      present: '出勤',
      absent: '缺勤',
      sick: '病假',
      leave: '事假',
    }
    return map[status] || status
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      present: '#22c55e',
      absent: '#ef4444',
      sick: '#f59e0b',
      leave: '#3b82f6',
    }
    return map[status] || '#94a3b8'
  }

  if (!student) {
    return (
      <View className='loading'>
        <Text>加载中...</Text>
      </View>
    )
  }

  const assignedClasses = getAssignedClasses(currentUser)

  return (
    <View className='detail-page'>
      <View className='header-card'>
        <View className='avatar'>
          <Text>{student.gender === '女' ? '👧' : '👦'}</Text>
        </View>
        <View className='basic-info'>
          <Text className='name'>{student.name}</Text>
          <Text className='class'>{getClass(student)}</Text>
          {teacherRole && (
            <Text className='class'>教师权限：{assignedClasses.join('、')}</Text>
          )}
        </View>
        {!isEditing && canEditStudent && (
          <View className='header-actions'>
            <View className='edit-btn' onClick={() => setIsEditing(true)}>
              <Text>编辑</Text>
            </View>
            {!teacherRole && (
              <View className='more-btn' onClick={handleDelete}>
                <Text>删除</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View className='tabs'>
        {[
          { key: 'info', label: '基本信息' },
          { key: 'attendance', label: '考勤记录' },
          { key: 'payment', label: '缴费记录' },
        ].map((tab) => (
          <View
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key as 'info' | 'attendance' | 'payment')}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView className='content' scrollY>
        {activeTab === 'info' && (
          <View className='info-section'>
            {isEditing ? (
              <View className='edit-form'>
                <View className='form-group'>
                  <Text className='group-title'>学生信息</Text>

                  <View className='form-item'>
                    <Text className='label'>姓名</Text>
                    <Input value={editForm.name} onInput={(e) => setEditForm((prev) => ({ ...prev, name: e.detail.value }))} />
                  </View>

                  <View className='form-item'>
                    <Text className='label'>性别</Text>
                    <View className='gender-btns'>
                      {['男', '女'].map((gender) => (
                        <View
                          key={gender}
                          className={`gender-btn ${editForm.gender === gender ? 'active' : ''}`}
                          onClick={() => setEditForm((prev) => ({ ...prev, gender }))}
                        >
                          <Text>{gender}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View className='form-item'>
                    <Text className='label'>班级</Text>
                    <Input
                      value={editForm.class}
                      disabled={teacherRole}
                      onInput={(e) => setEditForm((prev) => ({ ...prev, class: e.detail.value }))}
                    />
                  </View>

                  <View className='form-item'>
                    <Text className='label'>出生日期</Text>
                    <Picker
                      mode='date'
                      value={editForm.birthDate || '2020-01-01'}
                      start='2015-01-01'
                      end={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, birthDate: e.detail.value }))}
                    >
                      <View className='picker-value'>
                        <Text className={editForm.birthDate ? '' : 'placeholder'}>{editForm.birthDate || '请选择出生日期'}</Text>
                        <Text className='picker-arrow'>▼</Text>
                      </View>
                    </Picker>
                  </View>
                </View>

                <View className='form-group'>
                  <Text className='group-title'>家长信息</Text>

                  <View className='form-item'>
                    <Text className='label'>家长姓名</Text>
                    <Input value={editForm.parent_name} onInput={(e) => setEditForm((prev) => ({ ...prev, parent_name: e.detail.value }))} />
                  </View>

                  <View className='form-item'>
                    <Text className='label'>联系电话</Text>
                    <Input type='number' value={editForm.parent_phone} onInput={(e) => setEditForm((prev) => ({ ...prev, parent_phone: e.detail.value }))} />
                  </View>

                  <View className='form-item'>
                    <Text className='label'>家庭地址</Text>
                    <Input value={editForm.address} onInput={(e) => setEditForm((prev) => ({ ...prev, address: e.detail.value }))} />
                  </View>
                </View>

                <View className='action-btns'>
                  <View className='btn cancel' onClick={() => { setIsEditing(false); setEditForm(student) }}>
                    <Text>取消</Text>
                  </View>
                  <View className='btn save' onClick={() => void handleSave()}>
                    <Text>保存</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View className='info-display'>
                <View className='info-group'>
                  <Text className='group-title'>学生信息</Text>
                  <View className='info-row'><Text className='label'>性别</Text><Text className='value'>{student.gender || '-'}</Text></View>
                  <View className='info-row'><Text className='label'>班级</Text><Text className='value'>{getClass(student) || '-'}</Text></View>
                  <View className='info-row'><Text className='label'>出生日期</Text><Text className='value'>{student.birthDate || '-'}</Text></View>
                  <View className='info-row'><Text className='label'>身高</Text><Text className='value'>{student.height ? `${student.height}cm` : '-'}</Text></View>
                  <View className='info-row'><Text className='label'>体重</Text><Text className='value'>{student.weight ? `${student.weight}kg` : '-'}</Text></View>
                  <View className='info-row'><Text className='label'>血型</Text><Text className='value'>{student.bloodType || '-'}</Text></View>
                  <View className='info-row'><Text className='label'>过敏信息</Text><Text className='value'>{student.allergies || '无'}</Text></View>
                </View>

                <View className='info-group'>
                  <Text className='group-title'>家长信息</Text>
                  <View className='info-row'><Text className='label'>家长姓名</Text><Text className='value'>{getParentName(student) || '-'}</Text></View>
                  <View className='info-row'><Text className='label'>关系</Text><Text className='value'>{student.parent_relation || '-'}</Text></View>
                  <View className='info-row'>
                    <Text className='label'>联系电话</Text>
                    <Text className='value clickable' onClick={() => {
                      const phone = getParentPhone(student)
                      if (phone) Taro.makePhoneCall({ phoneNumber: phone })
                    }}
                    >
                      {getParentPhone(student) || '-'}
                    </Text>
                  </View>
                  <View className='info-row'><Text className='label'>家庭地址</Text><Text className='value'>{student.address || '-'}</Text></View>
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'attendance' && (
          <View className='attendance-section'>
            <View className='attendance-stats'>
              <View className='stat-item'>
                <Text className='number'>{attendanceRecords.filter((record) => record.status === 'present').length}</Text>
                <Text className='label'>出勤</Text>
              </View>
              <View className='stat-item'>
                <Text className='number' style={{ color: '#ef4444' }}>{attendanceRecords.filter((record) => record.status === 'absent').length}</Text>
                <Text className='label'>缺勤</Text>
              </View>
              <View className='stat-item'>
                <Text className='number' style={{ color: '#f59e0b' }}>{attendanceRecords.filter((record) => record.status === 'sick').length}</Text>
                <Text className='label'>病假</Text>
              </View>
              <View className='stat-item'>
                <Text className='number' style={{ color: '#3b82f6' }}>{attendanceRecords.filter((record) => record.status === 'leave').length}</Text>
                <Text className='label'>事假</Text>
              </View>
            </View>

            <View className='record-list'>
              {attendanceRecords.length > 0 ? attendanceRecords.map((record, index) => (
                <View key={index} className='record-item'>
                  <Text className='date'>{record.date}</Text>
                  <Text className='status' style={{ color: getStatusColor(record.status) }}>
                    {getStatusLabel(record.status)}
                  </Text>
                  {record.notes && <Text className='notes'>{record.notes}</Text>}
                </View>
              )) : (
                <View className='empty'><Text>暂无考勤记录</Text></View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'payment' && (
          <View className='payment-section'>
            {payments.length > 0 ? payments.map((payment, index) => (
              <View key={index} className='payment-item'>
                <View className='payment-header'>
                  <Text className='amount'>¥{payment.amount.toLocaleString()}</Text>
                  <Text className='status paid'>已缴</Text>
                </View>
                <View className='payment-details'>
                  <Text className='date'>{new Date(payment.paymentDate).toLocaleDateString()}</Text>
                  <Text className='type'>
                    {payment.feeDetails?.map((item: any) => item.label).join('、') || payment.feeType}
                  </Text>
                </View>
                <Text className='notes'>{getPaymentClassName(payment)}</Text>
                {payment.notes && <Text className='notes'>{payment.notes}</Text>}
              </View>
            )) : (
              <View className='empty'><Text>暂无缴费记录</Text></View>
            )}
          </View>
        )}
      </ScrollView>

      {activeTab === 'attendance' && (
        <View className='footer-btn' onClick={() => Taro.navigateTo({ url: `/pages/students/attendance?id=${id}&name=${student.name}&class=${getClass(student)}` })}>
          <Text>记录今日考勤</Text>
        </View>
      )}
    </View>
  )
}
