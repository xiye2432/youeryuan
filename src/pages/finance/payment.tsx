import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { loadData, savePaymentToBackend, STORAGE_KEYS } from '../../services/dataService'
import { getAssignedClasses, getCurrentUser, isTeacher, redirectToProfileSetupIfNeeded } from '../../utils/userAccess'
import './payment.scss'

interface Student {
  id: string
  name: string
  class?: string
  className?: string
}

interface FeeItem {
  key: string
  label: string
  price: number
  checked: boolean
}

const getStudentClass = (student: Student) => student.class || student.className || ''

export default function Payment() {
  const currentUser = getCurrentUser()
  const teacherRole = isTeacher(currentUser)
  const assignedClasses = getAssignedClasses(currentUser)

  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [searchText, setSearchText] = useState('')
  const [feeItems, setFeeItems] = useState<FeeItem[]>([
    { key: 'tuition', label: '保教费', price: 1200, checked: true },
    { key: 'meal', label: '伙食费', price: 330, checked: true },
    { key: 'itemFee', label: '杂项费', price: 700, checked: false },
    { key: 'schoolBag', label: '书包', price: 120, checked: false },
    { key: 'uniform', label: '校服', price: 280, checked: false },
  ])
  const [periodType, setPeriodType] = useState<'monthly' | 'semester' | 'yearly'>('monthly')
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'cash' | 'transfer'>('wechat')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (redirectToProfileSetupIfNeeded('finance-payment')) return

    if (teacherRole) {
      Taro.showToast({ title: '教师账号只能查看收费概览和缴费记录', icon: 'none' })
      setTimeout(() => {
        Taro.navigateBack({ fail: () => Taro.redirectTo({ url: '/pages/finance/index' }) })
      }, 300)
      return
    }

    void loadStudents()
  }, [])

  const loadStudents = async () => {
    const data = await loadData<Student>(STORAGE_KEYS.STUDENTS, { campus: currentUser?.campus })
    const visibleStudents = assignedClasses.length
      ? data.filter((student) => assignedClasses.includes(getStudentClass(student)))
      : data
    setStudents(visibleStudents)
  }

  const filteredStudents = students.filter((student) =>
    student.name.includes(searchText) || getStudentClass(student).includes(searchText),
  )

  const toggleFeeItem = (key: string) => {
    setFeeItems((prev) => prev.map((item) => item.key === key ? { ...item, checked: !item.checked } : item))
  }

  const calculateTotal = () => {
    return feeItems.filter((item) => item.checked).reduce((total, item) => {
      if (item.key === 'tuition' || item.key === 'meal') {
        const multiplier = periodType === 'monthly' ? 1 : periodType === 'semester' ? 6 : 12
        return total + item.price * multiplier
      }
      return total + item.price
    }, 0)
  }

  const handleSubmit = () => {
    if (!selectedStudent) {
      Taro.showToast({ title: '请选择学生', icon: 'none' })
      return
    }

    const checkedItems = feeItems.filter((item) => item.checked)
    if (!checkedItems.length) {
      Taro.showToast({ title: '请选择缴费项目', icon: 'none' })
      return
    }

    const total = calculateTotal()
    Taro.showModal({
      title: '确认收费',
      content: `学生：${selectedStudent.name}\n金额：¥${total.toLocaleString()}\n确认提交吗？`,
      success: async (res) => {
        if (!res.confirm) return

        const payment = {
          id: `pay_${Date.now()}`,
          studentId: selectedStudent.id,
          studentName: selectedStudent.name,
          studentClass: getStudentClass(selectedStudent),
          campus: currentUser?.campus,
          amount: total,
          feeType: checkedItems.map((item) => item.key).join(','),
          feeDetails: checkedItems.map((item) => ({ key: item.key, label: item.label, price: item.price })),
          periodType,
          paymentMethod,
          status: 'paid',
          paymentDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          notes,
        }

        const result = await savePaymentToBackend(payment)
        Taro.showToast({ title: result.error || '收费成功', icon: result.error ? 'none' : 'success' })
        setTimeout(() => {
          Taro.navigateBack()
        }, 300)
      },
    })
  }

  const total = calculateTotal()

  return (
    <View className='payment-page'>
      <View className='section'>
        <Text className='section-title'>选择学生</Text>
        <View className='search-box'>
          <Input
            placeholder='搜索学生姓名或班级'
            value={searchText}
            onInput={(e) => setSearchText(e.detail.value)}
          />
        </View>

        {searchText && filteredStudents.length > 0 && (
          <ScrollView className='student-dropdown' scrollY>
            {filteredStudents.slice(0, 6).map((student) => (
              <View
                key={student.id}
                className='dropdown-item'
                onClick={() => {
                  setSelectedStudent(student)
                  setSearchText('')
                }}
              >
                <Text>{student.name}</Text>
                <Text className='class'>{getStudentClass(student)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {selectedStudent && (
          <View className='selected-student'>
            <Text className='name'>{selectedStudent.name}</Text>
            <Text className='class'>{getStudentClass(selectedStudent)}</Text>
            <Text className='remove' onClick={() => setSelectedStudent(null)}>×</Text>
          </View>
        )}
      </View>

      <View className='section'>
        <Text className='section-title'>费用项目</Text>
        <View className='fee-list'>
          {feeItems.map((item) => (
            <View key={item.key} className={`fee-item ${item.checked ? 'checked' : ''}`} onClick={() => toggleFeeItem(item.key)}>
              <View className='checkbox'>{item.checked ? '✓' : ''}</View>
              <Text className='label'>{item.label}</Text>
              <Text className='price'>¥{item.price}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>缴费周期</Text>
        <View className='period-options'>
          {(['monthly', 'semester', 'yearly'] as const).map((type) => (
            <View key={type} className={`period-btn ${periodType === type ? 'active' : ''}`} onClick={() => setPeriodType(type)}>
              <Text>{type === 'monthly' ? '按月' : type === 'semester' ? '半年' : '一年'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>支付方式</Text>
        <View className='payment-methods'>
          {[
            { key: 'wechat', label: '微信', icon: '💬' },
            { key: 'alipay', label: '支付宝', icon: '💙' },
            { key: 'cash', label: '现金', icon: '💵' },
            { key: 'transfer', label: '转账', icon: '🏦' },
          ].map((method) => (
            <View
              key={method.key}
              className={`method-btn ${paymentMethod === method.key ? 'active' : ''}`}
              onClick={() => setPaymentMethod(method.key as 'wechat' | 'alipay' | 'cash' | 'transfer')}
            >
              <Text className='icon'>{method.icon}</Text>
              <Text>{method.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='section'>
        <Text className='section-title'>备注</Text>
        <Input className='notes-input' placeholder='可选填写备注信息' value={notes} onInput={(e) => setNotes(e.detail.value)} />
      </View>

      <View className='footer'>
        <View className='total'>
          <Text className='label'>应付金额</Text>
          <Text className='amount'>¥{total.toLocaleString()}</Text>
        </View>
        <View className='submit-btn' onClick={handleSubmit}>
          <Text>确认收款</Text>
        </View>
      </View>
    </View>
  )
}
