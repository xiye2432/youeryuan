import { useEffect, useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { syncAllFromCloud } from '../../services/dataService'
import {
  DEFAULT_CAMPUSES,
  getAssignedClasses,
  getAvailableClasses,
  getCurrentUser,
  goHomeByRole,
  isProfileComplete,
  isTeacher,
  updateStoredCurrentUser,
} from '../../utils/userAccess'
import './setup.scss'

export default function ProfileSetup() {
  const router = useRouter()
  const [user, setUser] = useState(getCurrentUser())
  const [campus, setCampus] = useState(user?.campus || DEFAULT_CAMPUSES[0])
  const [selectedClass, setSelectedClass] = useState(getAssignedClasses(user)[0] || '')
  const [saving, setSaving] = useState(false)
  const [syncingClasses, setSyncingClasses] = useState(false)
  const [classesVersion, setClassesVersion] = useState(0)

  const teacherRole = useMemo(() => isTeacher(user), [user])
  const availableClasses = useMemo(() => {
    const scopedClasses = getAvailableClasses(campus)
    if (scopedClasses.length) return scopedClasses
    return getAvailableClasses()
  }, [campus, classesVersion])

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (!currentUser) {
      Taro.redirectTo({ url: '/pages/login/index' })
      return
    }

    const currentCampus = currentUser.campus || DEFAULT_CAMPUSES[0]
    const currentClass = getAssignedClasses(currentUser)[0] || ''
    setUser(currentUser)
    setCampus(currentCampus)
    setSelectedClass(currentClass)
  }, [])

  useEffect(() => {
    if (!teacherRole || !campus) return
    void syncClassesForCampus(campus)
  }, [teacherRole, campus])

  useEffect(() => {
    if (selectedClass && !availableClasses.includes(selectedClass)) {
      setSelectedClass('')
    }
    if (!selectedClass && availableClasses.length === 1) {
      setSelectedClass(availableClasses[0])
    }
  }, [availableClasses, selectedClass])

  const syncClassesForCampus = async (targetCampus: string) => {
    setSyncingClasses(true)
    try {
      await syncAllFromCloud(targetCampus)
      setClassesVersion((prev) => prev + 1)
    } catch (error) {
      console.error('[profile setup] auto sync classes error', error)
    } finally {
      setSyncingClasses(false)
    }
  }

  const handleSubmit = async () => {
    if (!campus) {
      Taro.showToast({ title: '请选择所属园区', icon: 'none' })
      return
    }

    if (teacherRole && !selectedClass) {
      Taro.showToast({ title: '请选择负责班级', icon: 'none' })
      return
    }

    setSaving(true)
    const updatedUser = updateStoredCurrentUser({
      campus,
      assignedClasses: teacherRole ? [selectedClass] : [],
      managedClass: teacherRole ? selectedClass : '',
      profileCompleted: true,
    })

    if (!updatedUser) {
      setSaving(false)
      Taro.showToast({ title: '用户信息不存在', icon: 'none' })
      return
    }

    try {
      Taro.showLoading({ title: '同步数据中...' })
      await syncAllFromCloud(updatedUser.campus)
    } catch (error) {
      console.error('[profile setup] sync error', error)
    } finally {
      Taro.hideLoading()
      setSaving(false)
    }

    Taro.showToast({ title: '资料已保存', icon: 'success' })

    setTimeout(() => {
      if (router.params.from === 'profile') {
        Taro.redirectTo({ url: '/pages/profile/index' })
        return
      }
      goHomeByRole(updatedUser)
    }, 300)
  }

  if (!user) {
    return <View className='profile-setup-page' />
  }

  const submitDisabled = !campus || (teacherRole && !selectedClass) || saving
  const alreadyComplete = isProfileComplete(user)

  return (
    <View className='profile-setup-page'>
      <View className='setup-card'>
        <Text className='setup-title'>{alreadyComplete ? '编辑个人信息' : '首次登录，请先完善信息'}</Text>
        <Text className='setup-desc'>
          页面会直接显示当前已同步的班级，同时在后台自动刷新最新班级数据，不需要手动填写。
        </Text>

        <View className='form-section'>
          <Text className='section-label'>所属园区</Text>
          <View className='option-grid'>
            {DEFAULT_CAMPUSES.map((item) => (
              <View
                key={item}
                className={`option-item ${campus === item ? 'active' : ''}`}
                onClick={() => setCampus(item)}
              >
                <Text>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {teacherRole && (
          <View className='form-section'>
            <Text className='section-label'>负责班级</Text>

            {availableClasses.length > 0 ? (
              <>
                <View className='option-grid'>
                  {availableClasses.map((item) => (
                    <View
                      key={item}
                      className={`option-item ${selectedClass === item ? 'active' : ''}`}
                      onClick={() => setSelectedClass(item)}
                    >
                      <Text>{item}</Text>
                    </View>
                  ))}
                </View>
                <Text className='helper-text'>
                  {syncingClasses
                    ? `已先显示当前班级，正在后台刷新 ${campus} 的最新数据...`
                    : '请选择当前已有班级。'}
                </Text>
              </>
            ) : (
              <Text className='helper-text'>
                {syncingClasses
                  ? `正在自动同步 ${campus} 的班级数据，请稍等片刻。`
                  : '当前还没有可用班级数据，请先同步后再选择。'}
              </Text>
            )}

            <Text className='helper-text'>选择完成后，教师账号只能查看和修改本班学生。</Text>
          </View>
        )}

        <View
          className={`submit-btn ${submitDisabled ? 'disabled' : ''}`}
          onClick={() => {
            if (!submitDisabled) {
              void handleSubmit()
            }
          }}
        >
          <Text>{saving ? '保存中...' : '保存并继续'}</Text>
        </View>
      </View>
    </View>
  )
}
