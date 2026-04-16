import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Input, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { loadData, savePaymentToBackend, STORAGE_KEYS } from '../../services/dataService'

import './payment.scss'

interface Student {
  id: string
  name: string
  class: string
}

interface FeeItem {
  key: string
  label: string
  price: number
  checked: boolean
}

export default function Payment() {
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentIndex, setStudentIndex] = useState(-1)
  const [searchText, setSearchText] = useState('')
  
  // 费用项目
  const [feeItems, setFeeItems] = useState<FeeItem[]>([
    { key: 'tuition', label: '保教费', price: 1200, checked: true },
    { key: 'meal', label: '伙食费', price: 330, checked: true },
    { key: 'itemFee', label: '杂项费', price: 700, checked: false },
    { key: 'schoolBag', label: '书包', price: 120, checked: false },
    { key: 'uniform', label: '校服', price: 280, checked: false },
    { key: 'beddingOuter', label: '床品外皮', price: 268, checked: false },
    { key: 'beddingInner', label: '床品内芯', price: 160, checked: false },
  ])
  
  // 缴费周期
  const [periodType, setPeriodType] = useState<'monthly' | 'semester' | 'yearly'>('monthly')
  const periodOptions = ['按月缴', '半年缴', '一年缴']
  const periodMap = { 0: 'monthly', 1: 'semester', 2: 'yearly' }
  
  // 支付方式
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay' | 'cash' | 'transfer'>('wechat')
  
  // 备注
  const [notes, setNotes] = useState('')

    useEffect(() => {
    void loadStudents()
  }, [])

  const loadStudents = async () => {
    const data = await loadData<Student>(STORAGE_KEYS.STUDENTS)
    setStudents(data)
  }


  // 过滤学生
  const filteredStudents = students.filter(s => 
    s.name.includes(searchText) || s.class.includes(searchText)
  )

  // 切换费用项
  const toggleFeeItem = (key: string) => {
    setFeeItems(prev => prev.map(item => 
      item.key === key ? { ...item, checked: !item.checked } : item
    ))
  }

  // 计算总金额
  const calculateTotal = () => {
    let total = 0
    const checkedItems = feeItems.filter(item => item.checked)
    
    checkedItems.forEach(item => {
      if (item.key === 'tuition' || item.key === 'meal') {
        // 保教费和伙食费根据周期计算
        const multiplier = periodType === 'monthly' ? 1 : periodType === 'semester' ? 6 : 12
        total += item.price * multiplier
      } else {
        // 其他一次性费用
        total += item.price
      }
    })
    
    return total
  }

  // 提交缴费
  const handleSubmit = () => {
    if (!selectedStudent) {
      Taro.showToast({ title: '请选择学生', icon: 'none' })
      return
    }

    const checkedItems = feeItems.filter(item => item.checked)
    if (checkedItems.length === 0) {
      Taro.showToast({ title: '请选择缴费项目', icon: 'none' })
      return
    }

    const total = calculateTotal()
    
    Taro.showModal({
      title: '确认缴费',
      content: `学生：${selectedStudent.name}\n金额：¥${total.toLocaleString()}\n确认提交？`,
            success: async (res) => {

        if (res.confirm) {
          // 创建缴费记录
          const payment = {
            id: `pay_${Date.now()}`,
            studentId: selectedStudent.id,
            studentName: selectedStudent.name,
            studentClass: selectedStudent.class,
            amount: total,
            feeType: checkedItems.map(i => i.key).join(','),
            feeDetails: checkedItems.map(i => ({ key: i.key, label: i.label, price: i.price })),
            periodType,
            paymentMethod,
            status: 'paid',
            paymentDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            notes
          }

                    const result = await savePaymentToBackend(payment)
          Taro.showToast({ title: result.error || '缴费成功', icon: result.error ? 'none' : 'success' })

          
          setTimeout(() => {
            Taro.navigateBack()
          }, 1500)
        }
      }
    })
  }

  // 快捷选择
  const quickSelect = (type: 'monthly' | 'newStudent') => {
    if (type === 'monthly') {
      // 月缴：保教费+伙食费
      setFeeItems(prev => prev.map(item => ({
        ...item,
        checked: item.key === 'tuition' || item.key === 'meal'
      })))
      setPeriodType('monthly')
    } else {
      // 新生：全选
      setFeeItems(prev => prev.map(item => ({ ...item, checked: true })))
      setPeriodType('monthly')
    }
  }

  const total = calculateTotal()

  return (
    <View className='payment-page'>
      {/* 选择学生 */}
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
            {filteredStudents.slice(0, 5).map(student => (
              <View
                key={student.id}
                className='dropdown-item'
                onClick={() => {
                  setSelectedStudent(student)
                  setSearchText('')
                }}
              >
                <Text>{student.name}</Text>
                <Text className='class'>{student.class}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {selectedStudent && (
          <View className='selected-student'>
            <Text className='name'>{selectedStudent.name}</Text>
            <Text className='class'>{selectedStudent.class}</Text>
            <Text className='remove' onClick={() => setSelectedStudent(null)}>×</Text>
          </View>
        )}
      </View>

      {/* 快捷选择 */}
      <View className='section'>
        <Text className='section-title'>快捷选择</Text>
        <View className='quick-btns'>
          <View className='quick-btn' onClick={() => quickSelect('monthly')}>
            <Text>📅 月缴套餐</Text>
            <Text className='desc'>保教费+伙食费</Text>
          </View>
          <View className='quick-btn new' onClick={() => quickSelect('newStudent')}>
            <Text>🎒 新生入园</Text>
            <Text className='desc'>全部费用</Text>
          </View>
        </View>
      </View>

      {/* 费用项目 */}
      <View className='section'>
        <Text className='section-title'>费用项目</Text>
        <View className='fee-list'>
          {feeItems.map(item => (
            <View 
              key={item.key}
              className={`fee-item ${item.checked ? 'checked' : ''}`}
              onClick={() => toggleFeeItem(item.key)}
            >
              <View className='checkbox'>{item.checked ? '✓' : ''}</View>
              <Text className='label'>{item.label}</Text>
              <Text className='price'>¥{item.price}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 缴费周期 */}
      <View className='section'>
        <Text className='section-title'>缴费周期（保教费/伙食费）</Text>
        <View className='period-options'>
          {(['monthly', 'semester', 'yearly'] as const).map(type => (
            <View
              key={type}
              className={`period-btn ${periodType === type ? 'active' : ''}`}
              onClick={() => setPeriodType(type)}
            >
              <Text>{type === 'monthly' ? '按月' : type === 'semester' ? '半年' : '一年'}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 支付方式 */}
      <View className='section'>
        <Text className='section-title'>支付方式</Text>
        <View className='payment-methods'>
          {[
            { key: 'wechat', label: '微信', icon: '💚' },
            { key: 'alipay', label: '支付宝', icon: '💙' },
            { key: 'cash', label: '现金', icon: '💵' },
            { key: 'transfer', label: '转账', icon: '🏦' },
          ].map(method => (
            <View
              key={method.key}
              className={`method-btn ${paymentMethod === method.key ? 'active' : ''}`}
              onClick={() => setPaymentMethod(method.key as any)}
            >
              <Text className='icon'>{method.icon}</Text>
              <Text>{method.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 备注 */}
      <View className='section'>
        <Text className='section-title'>备注</Text>
        <Input
          className='notes-input'
          placeholder='可选填写备注信息'
          value={notes}
          onInput={(e) => setNotes(e.detail.value)}
        />
      </View>

      {/* 底部结算 */}
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
