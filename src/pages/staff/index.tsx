import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { deleteItem, loadData, saveItem, STORAGE_KEYS } from '../../services/dataService'
import './index.scss'



interface Teacher {
  id: string
  name: string
  phone: string
  role: string
  class?: string
  hireDate?: string
  status?: 'active' | 'inactive'
}

export default function Staff() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [searchText, setSearchText] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    phone: '',
    role: '教师',
    class: ''
  })
  const [currentUserRole, setCurrentUserRole] = useState('TEACHER')

  const roles = ['教师', '保育员', '厨房', '保安', '园长', '副园长', '财务']
  const classes = ['托班', '小一班', '小二班', '中一班', '中二班', '大一班', '大二班']
  const [isSyncing, setIsSyncing] = useState(false)
  const canManageStaff = ['SUPER_ADMIN', 'ADMIN'].includes(currentUserRole)



  useEffect(() => {
    void loadTeachers()
  }, [])

  useDidShow(() => {
    void loadTeachers()
  })

    const loadTeachers = async () => {
    const currentUser = Taro.getStorageSync('kt_current_user') || {}
    setCurrentUserRole(currentUser.role || 'TEACHER')
    const data = await loadData<Teacher>(STORAGE_KEYS.STAFF)
    setTeachers(data)
  }


  // 从云端同步（已配置 Supabase 时走 REST；否则沿用 OSS 公共读 JSON）
    const handleSync = async () => {
    setIsSyncing(true)
    try {
      const data = await loadData<Teacher>(STORAGE_KEYS.STAFF)
      setTeachers(data)
      Taro.showToast({
        title: data.length ? `已同步 ${data.length} 名教职工` : '云端暂无数据',
        icon: data.length ? 'success' : 'none',
      })
    } catch (err) {
      console.error('[Staff] 同步失败:', err)
      Taro.showToast({ title: '同步失败', icon: 'none' })
    } finally {
      setIsSyncing(false)
    }
  }

  // 过滤教职工
  const filteredTeachers = teachers.filter(t =>
    t.name.includes(searchText) || t.phone.includes(searchText) || t.role.includes(searchText)
  )

  // 按角色分组
  const groupedTeachers = filteredTeachers.reduce((acc, teacher) => {
    const role = teacher.role || '其他'
    if (!acc[role]) acc[role] = []
    acc[role].push(teacher)
    return acc
  }, {} as Record<string, Teacher[]>)

      // 添加教职工
  const handleAddTeacher = async () => {
    if (!canManageStaff) return

    if (!newTeacher.name.trim()) {
      Taro.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!newTeacher.phone.trim() || newTeacher.phone.length !== 11) {
      Taro.showToast({ title: '请输入有效手机号', icon: 'none' })
      return
    }

    const teacher: Teacher = {
      id: `t_${Date.now()}`,
      name: newTeacher.name,
      phone: newTeacher.phone,
      role: newTeacher.role,
      class: newTeacher.class,
      hireDate: new Date().toISOString().split('T')[0],
      status: 'active'
    }

    const result = await saveItem(STORAGE_KEYS.STAFF, teacher)
    if (!result.success) {
      Taro.showToast({ title: result.error || '保存失败', icon: 'none' })
      return
    }

    const updated = (Taro.getStorageSync(STORAGE_KEYS.STAFF) || []) as Teacher[]
    setTeachers(updated)
    setIsAddModalOpen(false)
    setNewTeacher({ name: '', phone: '', role: '教师', class: '' })

        const title =
      result.error || '添加成功'
    Taro.showToast({ title, icon: result.error ? 'none' : 'success' })
  }

  // 删除教职工
  const deleteTeacher = (teacher: Teacher) => {
    if (!canManageStaff) return

    Taro.showModal({
      title: '确认删除',
      content: `确定删除 ${teacher.name} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          const del = await deleteItem(STORAGE_KEYS.STAFF, teacher.id)
          if (!del.success) {
            Taro.showToast({ title: del.error || '删除失败', icon: 'none' })
            return
          }
          const updated = (Taro.getStorageSync(STORAGE_KEYS.STAFF) || []) as Teacher[]
          setTeachers(updated)
                    Taro.showToast({
            title: '删除成功',
            icon: 'success',
          })
        }
      }
    })
  }



  return (
    <View className='staff-page'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <View className='search-input'>
          <Text className='icon'>🔍</Text>
          <Input
            placeholder='搜索姓名、电话或角色'
            value={searchText}
            onInput={(e) => setSearchText(e.detail.value)}
          />
        </View>
                        <View 
          className={`sync-btn ${isSyncing ? 'syncing' : ''}`} 
          onClick={!isSyncing ? handleSync : undefined}
        >
          <Text>{isSyncing ? '...' : '🔄'}</Text>
        </View>
        {canManageStaff && (
          <View className='add-btn' onClick={() => setIsAddModalOpen(true)}>
            <Text>+</Text>
          </View>
        )}


      </View>

      {/* 统计 */}
      <View className='stats-bar'>
        <Text>共 {filteredTeachers.length} 名教职工</Text>
        {teachers.length === 0 && <Text className='hint'>点击 🔄 从云端同步</Text>}
      </View>

      {/* 列表 */}
      <ScrollView className='staff-list' scrollY>
        {Object.entries(groupedTeachers).map(([role, list]) => (
          <View key={role} className='role-group'>
            <View className='role-header'>
              <Text className='role-name'>{role}</Text>
              <Text className='count'>{list.length}人</Text>
            </View>
            {list.map(teacher => (
              <View key={teacher.id} className='staff-card'>
                <View className='avatar'>
                  <Text>{teacher.name.slice(0, 1)}</Text>
                </View>
                <View className='info'>
                  <Text className='name'>{teacher.name}</Text>
                  <Text className='meta'>
                    {teacher.class ? `${teacher.class} · ` : ''}{teacher.phone}
                  </Text>
                </View>
                {canManageStaff && (
                  <View className='actions'>
                    <View className='action-btn delete' onClick={() => deleteTeacher(teacher)}>
                      <Text>🗑️</Text>
                    </View>
                  </View>
                )}


              </View>
            ))}
          </View>
        ))}

        {filteredTeachers.length === 0 && (
          <View className='empty'>
            <Text className='icon'>👥</Text>
            <Text>暂无教职工数据</Text>
            <Text className='hint'>请点击顶部 🔄 从云端同步数据</Text>
            <View className='sync-btn-big' onClick={handleSync}>
              <Text>{isSyncing ? '同步中...' : '🔄 立即同步'}</Text>
            </View>
          </View>
        )}

                <View style={{ height: '100rpx' }}></View>
      </ScrollView>

      {canManageStaff && isAddModalOpen && (
        <View className='modal-overlay' onClick={() => setIsAddModalOpen(false)}>
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>添加教职工</Text>

            <View className='form-item'>
              <Text className='label'>姓名 *</Text>
              <Input
                placeholder='请输入姓名'
                value={newTeacher.name}
                onInput={(e) => setNewTeacher(prev => ({ ...prev, name: e.detail.value }))}
              />
            </View>

            <View className='form-item'>
              <Text className='label'>手机号 *</Text>
              <Input
                type='number'
                placeholder='请输入11位手机号'
                value={newTeacher.phone}
                onInput={(e) => setNewTeacher(prev => ({ ...prev, phone: e.detail.value }))}
                maxlength={11}
              />
            </View>

            <View className='form-item'>
              <Text className='label'>角色</Text>
              <View className='role-options'>
                {roles.map(role => (
                  <View
                    key={role}
                    className={`role-btn ${newTeacher.role === role ? 'active' : ''}`}
                    onClick={() => setNewTeacher(prev => ({ ...prev, role }))}
                  >
                    <Text>{role}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='form-item'>
              <Text className='label'>所带班级（可选）</Text>
              <View className='class-options'>
                <View
                  className={`class-btn ${!newTeacher.class ? 'active' : ''}`}
                  onClick={() => setNewTeacher(prev => ({ ...prev, class: '' }))}
                >
                  <Text>无</Text>
                </View>
                {classes.map(cls => (
                  <View
                    key={cls}
                    className={`class-btn ${newTeacher.class === cls ? 'active' : ''}`}
                    onClick={() => setNewTeacher(prev => ({ ...prev, class: cls }))}
                  >
                    <Text>{cls}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className='modal-actions'>
              <View className='btn cancel' onClick={() => setIsAddModalOpen(false)}>
                <Text>取消</Text>
              </View>
              <View className='btn confirm' onClick={handleAddTeacher}>
                <Text>确认添加</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}


