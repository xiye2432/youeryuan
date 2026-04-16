import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { loadMealPlansFromBackend, saveMealPlanToBackend, STORAGE_KEYS } from '../../services/dataService'
import { AUTH_TOKEN_KEY } from '../../services/qideApi'

import './index.scss'

interface DishIngredient {
  name: string
  perPersonGrams: number
}

interface MealDish {
  dishName: string
  ingredients: DishIngredient[]
}

interface DailyRecipe {
  day: string
  meals: {
    breakfast: MealDish
    morningFruitSnack?: MealDish
    morningSnack: MealDish
    lunch: {
      mainDish: MealDish
      sideDish: MealDish
      soup: MealDish
      staple: MealDish
    }
    milkSnack: MealDish
    afternoonSnack: MealDish
    dinner: MealDish
  }
}

interface WeeklyRecipeRecord {
  id: string
  weekRange: string
  grade: string
  headcount: number
  days: DailyRecipe[]
  createdAt: string
  status: 'DRAFT' | 'CONFIRMED'
  nutritionSummary?: {
    avgEnergy: number
    avgProtein: number
    varietyCount: number
  }
}

const CAMPUS_CONFIG: Record<string, { name: string }> = {
  PHUI: { name: '普惠园' },
  HIGH_END: { name: '高端园' },
  JIU_YOU: { name: '九幼' },
  SHIQI_YOU: { name: '十七幼' }
}

const createEmptyDish = (): MealDish => ({ dishName: '', ingredients: [] })

const MEAL_LABELS: { key: string; label: string; icon: string }[] = [
  { key: 'morningFruitSnack', label: '水果加餐', icon: '🍎' },
  { key: 'morningSnack', label: '上午点心', icon: '🥐' },
  { key: 'lunch', label: '午餐', icon: '🍱' },
  { key: 'milkSnack', label: '牛奶加餐', icon: '🥛' },
  { key: 'afternoonSnack', label: '下午点心', icon: '🍪' },
  { key: 'dinner', label: '晚餐', icon: '🍲' },
]

function getDishName(meals: DailyRecipe['meals'], key: string): string {
  if (key === 'lunch') {
    const lunch = meals.lunch
    const parts = [lunch.mainDish, lunch.sideDish, lunch.soup, lunch.staple]
      .filter(d => d?.dishName && d.dishName !== '待定')
      .map(d => d.dishName)
    return parts.length > 0 ? parts.join('、') : ''
  }
  const dish = (meals as any)[key] as MealDish | undefined
  return dish?.dishName && dish.dishName !== '待定' ? dish.dishName : ''
}

export default function Kitchen() {
  const [history, setHistory] = useState<WeeklyRecipeRecord[]>([])
  const [currentRecord, setCurrentRecord] = useState<WeeklyRecipeRecord | null>(null)
  const [activeDayIdx, setActiveDayIdx] = useState(0)
  const [viewMode, setViewMode] = useState<'dashboard' | 'current' | 'history'>('dashboard')
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [currentRole, setCurrentRole] = useState('TEACHER')
  const [isEditing, setIsEditing] = useState(false)
  const [editingDay, setEditingDay] = useState<DailyRecipe | null>(null)

  const isKitchen = currentRole === 'KITCHEN'
  const weekdays = ['周一', '周二', '周三', '周四', '周五']
  const canEditMenu = isKitchen

  useEffect(() => {
    loadData()
  }, [])

  useDidShow(() => {
    loadData()
  })

  const loadData = async () => {
    setIsLoading(true)
    const currentUser = Taro.getStorageSync('kt_current_user') || {}
    setCurrentRole(currentUser.role || 'TEACHER')

    const localHistory =
      Taro.getStorageSync(STORAGE_KEYS.MEAL_PLANS) ||
      Taro.getStorageSync(STORAGE_KEYS.KITCHEN_HISTORY) ||
      []

    if (localHistory.length > 0) {
      setHistory(localHistory)
      const confirmed = localHistory.filter((r: WeeklyRecipeRecord) => r.status === 'CONFIRMED')
      if (confirmed.length > 0) {
        setCurrentRecord(confirmed[0])
      }
      if (!Taro.getStorageSync(STORAGE_KEYS.MEAL_PLANS) && Taro.getStorageSync(STORAGE_KEYS.KITCHEN_HISTORY)) {
        Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, localHistory)
      }
    } else {
      await handleSync()
    }

    setIsLoading(false)
  }

  const handleSync = async () => {
    setIsSyncing(true)

    try {
      const currentUser = Taro.getStorageSync('kt_current_user') || {}
      const finalData = await loadMealPlansFromBackend(currentUser.campus)

      if (finalData && finalData.length > 0) {
        Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, finalData)
        setHistory(finalData)

        const confirmed = finalData.filter(r => r.status === 'CONFIRMED')
        if (confirmed.length > 0) {
          setCurrentRecord(confirmed[0])
        }

        Taro.showToast({ title: `已同步 ${finalData.length} 份食谱`, icon: 'success' })
      } else {
        Taro.showToast({ title: '后端暂无食谱数据', icon: 'none' })
      }

    } catch (err) {
      console.error('[Kitchen] 同步失败:', err)
      Taro.showToast({ title: '同步失败', icon: 'none' })
    } finally {
      setIsSyncing(false)
    }
  }

  const publishRecord = async (record: WeeklyRecipeRecord) => {
    if (!canEditMenu) return
    const updated = { ...record, status: 'CONFIRMED' as const }
    const updatedHistory = history.map(item => item.id === updated.id ? updated : item)
    Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, updatedHistory)
    Taro.setStorageSync(STORAGE_KEYS.KITCHEN_HISTORY, updatedHistory)
    setHistory(updatedHistory)
    setCurrentRecord(updated)
    await saveMealPlanToBackend(updated)
    Taro.showToast({ title: '食谱已发布', icon: 'success' })
  }

  const getTodayDayIndex = (): number => {
    const jsDay = new Date().getDay()
    return jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : 0
  }

  const getTodayMeals = (): DailyRecipe | null => {
    if (!currentRecord?.days) return null
    const idx = getTodayDayIndex()
    return currentRecord.days[idx] || null
  }

  const getDraftRecords = (): WeeklyRecipeRecord[] => {
    return history.filter(r => r.status === 'DRAFT')
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          Taro.removeStorageSync('kt_current_user')
          Taro.removeStorageSync(AUTH_TOKEN_KEY)
          Taro.redirectTo({ url: '/pages/login/index' })
        }
      }
    })
  }

  const getDietRiskCount = (): number => {
    return history.filter(r => r.status === 'DRAFT').length
  }

  const getTodayAttendanceCount = (): number => {
    const today = new Date().toISOString().split('T')[0]
    const attendance = Taro.getStorageSync(`kt_attendance_${today}`) || {}
    const present = Object.values(attendance).filter((r: any) => r.status === 'present').length
    if (present > 0) return present
    const students = Taro.getStorageSync('kt_students') || []
    return students.length
  }

  const getTodayPriorityText = (): string => {
    const today = getTodayMeals()
    if (!today) return '今日暂无食谱，请先同步数据'
    const meals = today.meals
    const missing: string[] = []
    if (!meals.lunch?.mainDish?.dishName || meals.lunch.mainDish.dishName === '待定') missing.push('午餐')
    if (!meals.afternoonSnack?.dishName || meals.afternoonSnack.dishName === '待定') missing.push('下午点心')
    if (!meals.dinner?.dishName || meals.dinner.dishName === '待定') missing.push('晚餐')

    const drafts = getDraftRecords()
    if (drafts.length > 0) {
      return `先确认本周食谱是否已发布（${drafts.length}份草稿待处理）`
    }
    if (missing.length > 0) {
      return `今日优先确认${missing.join('和')}`
    }
    return '先检查过敏与忌口提醒'
  }

  const renderDish = (label: string, dish: MealDish | undefined, icon: string, colorClass: string) => {
    if (!dish || !dish.dishName || dish.dishName === '待定') return null

    return (
      <View className={`meal-card ${colorClass}`}>
        <View className='meal-header'>
          <Text className='icon'>{icon}</Text>
          <Text className='label'>{label}</Text>
        </View>

        <View className='dish-content'>
          <Text className='dish-name'>{dish.dishName}</Text>

          {dish.ingredients && dish.ingredients.length > 0 && (
            <View className='ingredients'>
              {dish.ingredients.map((ing, idx) => (
                <View key={idx} className='ingredient-tag'>
                  <Text className='ing-name'>{ing.name}</Text>
                  <Text className='ing-grams'>{ing.perPersonGrams}g</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    )
  }

  const renderLunch = (lunch: DailyRecipe['meals']['lunch'] | undefined) => {
    if (!lunch) return null

    const { mainDish, sideDish, soup, staple } = lunch
    const hasValidDish = [mainDish, sideDish, soup, staple].some(
      d => d && d.dishName && d.dishName !== '待定'
    )

    if (!hasValidDish) return null

    return (
      <View className='meal-card lunch-card'>
        <View className='meal-header'>
          <Text className='icon'>🍱</Text>
          <Text className='label'>午餐</Text>
        </View>

        <View className='lunch-grid'>
          {mainDish?.dishName && mainDish.dishName !== '待定' && (
            <View className='lunch-item main'>
              <Text className='item-label'>主菜</Text>
              <Text className='item-name'>{mainDish.dishName}</Text>
            </View>
          )}

          {sideDish?.dishName && sideDish.dishName !== '待定' && (
            <View className='lunch-item side'>
              <Text className='item-label'>副菜</Text>
              <Text className='item-name'>{sideDish.dishName}</Text>
            </View>
          )}

          {soup?.dishName && soup.dishName !== '待定' && (
            <View className='lunch-item soup'>
              <Text className='item-label'>汤品</Text>
              <Text className='item-name'>{soup.dishName}</Text>
            </View>
          )}

          {staple?.dishName && staple.dishName !== '待定' && (
            <View className='lunch-item staple'>
              <Text className='item-label'>主食</Text>
              <Text className='item-name'>{staple.dishName}</Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  const renderDayMenu = (dayRecipe: DailyRecipe | undefined) => {
    if (!dayRecipe || !dayRecipe.meals) {
      return (
        <View className='no-data'>
          <Text className='icon'>📭</Text>
          <Text>暂无此日食谱</Text>
        </View>
      )
    }

    const { meals } = dayRecipe

    return (
      <View className='day-menu'>
        {renderDish('水果加餐', meals.morningFruitSnack, '🍎', 'fruit')}
        {renderDish('上午点心', meals.morningSnack, '🥐', 'morning-snack')}
        {renderLunch(meals.lunch)}
        {renderDish('牛奶加餐', meals.milkSnack, '🥛', 'milk')}
        {renderDish('下午点心', meals.afternoonSnack, '🍪', 'afternoon-snack')}
        {renderDish('晚餐', meals.dinner, '🍲', 'dinner')}
      </View>
    )
  }

  const selectHistoryRecord = (record: WeeklyRecipeRecord) => {
    setCurrentRecord(record)
    setViewMode('current')
    setActiveDayIdx(0)
    setIsEditing(false)
  }

  const startEditCurrentDay = () => {
    if (!canEditMenu || !currentRecord?.days?.[activeDayIdx]) return
    setEditingDay(JSON.parse(JSON.stringify(currentRecord.days[activeDayIdx])))
    setIsEditing(true)
  }

  const updateEditingDish = (path: string, value: string) => {
    if (!editingDay) return

    const nextDay = JSON.parse(JSON.stringify(editingDay))
    const segments = path.split('.')
    let cursor: any = nextDay.meals

    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i]
      if (!cursor[key]) cursor[key] = createEmptyDish()
      cursor = cursor[key]
    }

    cursor[segments[segments.length - 1]] = value
    setEditingDay(nextDay)
  }

  const saveCurrentDay = async () => {
    if (!canEditMenu || !currentRecord || !editingDay) return

    const updatedRecord = {
      ...currentRecord,
      days: currentRecord.days.map((day, index) => index === activeDayIdx ? editingDay : day),
      createdAt: new Date().toISOString(),
    }

    const updatedHistory = history.map(item => item.id === updatedRecord.id ? updatedRecord : item)
    const finalHistory = updatedHistory.some(item => item.id === updatedRecord.id)
      ? updatedHistory
      : [updatedRecord, ...updatedHistory]

    Taro.setStorageSync(STORAGE_KEYS.MEAL_PLANS, finalHistory)
    Taro.setStorageSync(STORAGE_KEYS.KITCHEN_HISTORY, finalHistory)
    setHistory(finalHistory)
    setCurrentRecord(updatedRecord)

    const result = await saveMealPlanToBackend(updatedRecord)
    setIsEditing(false)
    setEditingDay(null)
    Taro.showToast({ title: result.error || '食谱已保存', icon: result.error ? 'none' : 'success' })
  }

  const renderDashboard = () => {
    const todayMeals = getTodayMeals()
    const draftCount = getDraftRecords().length
    const dietRiskCount = getDietRiskCount()
    const priorityText = getTodayPriorityText()
    const currentUser = Taro.getStorageSync('kt_current_user') || {}

    return (
      <ScrollView className='dashboard-scroll' scrollY>
        <View className='workspace-header'>
          <View className='workspace-greeting'>
            <Text className='workspace-hello'>您好，</Text>
            <Text className='workspace-name'>{currentUser.name || '厨房师傅'}</Text>
          </View>
          <View className='workspace-role-badge'>
            <Text className='role-icon'>🍳</Text>
            <Text className='role-text'>厨房</Text>
          </View>
        </View>

        <View className='priority-banner'>
          <Text className='priority-icon'>🔔</Text>
          <Text className='priority-text'>{priorityText}</Text>
        </View>

        <View className='dashboard-stats'>
          <View className='dash-stat-card green'>
            <Text className='stat-number'>{currentRecord ? (currentRecord.status === 'CONFIRMED' ? '已发布' : '草稿') : '无'}</Text>
            <Text className='stat-label'>本周食谱状态</Text>
          </View>
          <View className='dash-stat-card amber'>
            <Text className='stat-number'>{dietRiskCount}</Text>
            <Text className='stat-label'>待处理食谱</Text>
          </View>
          <View className='dash-stat-card blue'>
            <Text className='stat-number'>{getTodayAttendanceCount()}</Text>
            <Text className='stat-label'>今日用餐人数</Text>
          </View>
        </View>

        <View className='dashboard-section'>
          <View className='section-header-row'>
            <Text className='section-title'>📋 今日菜单</Text>
            <Text className='section-link' onClick={() => { setViewMode('current'); setActiveDayIdx(getTodayDayIndex()) }}>查看详情 &gt;</Text>
          </View>
          {todayMeals ? (
            <View className='today-meals-grid'>
              {MEAL_LABELS.map(m => {
                const name = getDishName(todayMeals.meals, m.key)
                return (
                  <View key={m.key} className={`today-meal-item ${name ? '' : 'empty'}`}>
                    <Text className='meal-icon'>{m.icon}</Text>
                    <Text className='meal-label'>{m.label}</Text>
                    <Text className='meal-value'>{name || '未设置'}</Text>
                  </View>
                )
              })}
            </View>
          ) : (
            <View className='today-meals-empty'>
              <Text>今日暂无食谱数据，请先同步</Text>
            </View>
          )}
        </View>

        {draftCount > 0 && (
          <View className='dashboard-section alert-section'>
            <Text className='section-title'>⚠️ 待发布食谱提醒</Text>
            {getDraftRecords().map(record => (
              <View key={record.id} className='draft-alert-card'>
                <View className='draft-info'>
                  <Text className='draft-week'>{record.weekRange}</Text>
                  <Text className='draft-campus'>{CAMPUS_CONFIG[record.grade]?.name || record.grade}</Text>
                </View>
                <View className='draft-action' onClick={() => publishRecord(record)}>
                  <Text>发布</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View className='dashboard-section'>
          <Text className='section-title'>🚨 过敏与忌口提醒</Text>
          <View className='allergy-summary'>
            <Text className='allergy-hint'>
              请在备餐时特别注意过敏儿童餐食替代方案，确保每位幼儿安全用餐。
            </Text>
          </View>
        </View>

        {currentRecord && (
          <View className='dashboard-section'>
            <Text className='section-title'>📊 本周食谱摘要</Text>
            <View className='week-summary'>
              <View className='summary-row'>
                <Text className='summary-label'>周次</Text>
                <Text className='summary-value'>{currentRecord.weekRange}</Text>
              </View>
              <View className='summary-row'>
                <Text className='summary-label'>园区</Text>
                <Text className='summary-value'>{CAMPUS_CONFIG[currentRecord.grade]?.name || currentRecord.grade}</Text>
              </View>
              <View className='summary-row'>
                <Text className='summary-label'>状态</Text>
                <Text className={`summary-value ${currentRecord.status === 'CONFIRMED' ? 'status-confirmed' : 'status-draft'}`}>
                  {currentRecord.status === 'CONFIRMED' ? '已确认' : '草稿'}
                </Text>
              </View>
              {currentRecord.nutritionSummary && (
                <>
                  <View className='summary-row'>
                    <Text className='summary-label'>平均能量</Text>
                    <Text className='summary-value'>{currentRecord.nutritionSummary.avgEnergy} kcal</Text>
                  </View>
                  <View className='summary-row'>
                    <Text className='summary-label'>平均蛋白</Text>
                    <Text className='summary-value'>{currentRecord.nutritionSummary.avgProtein} g</Text>
                  </View>
                  <View className='summary-row'>
                    <Text className='summary-label'>食材种类</Text>
                    <Text className='summary-value'>{currentRecord.nutritionSummary.varietyCount} 种</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        <View className='dashboard-section'>
          <Text className='section-title'>⚡ 快捷入口</Text>
          <View className='quick-entry-grid'>
            <View className='quick-entry-item' onClick={() => { setViewMode('current'); setActiveDayIdx(getTodayDayIndex()) }}>
              <Text className='entry-icon'>📋</Text>
              <Text className='entry-label'>当前食谱</Text>
            </View>
            <View className='quick-entry-item' onClick={() => setViewMode('history')}>
              <Text className='entry-icon'>📚</Text>
              <Text className='entry-label'>历史食谱</Text>
            </View>
            {currentRecord && currentRecord.status === 'DRAFT' && (
              <View className='quick-entry-item' onClick={() => publishRecord(currentRecord)}>
                <Text className='entry-icon'>📢</Text>
                <Text className='entry-label'>发布食谱</Text>
              </View>
            )}
            <View className='quick-entry-item' onClick={!isSyncing ? handleSync : undefined}>
              <Text className='entry-icon'>🔄</Text>
              <Text className='entry-label'>{isSyncing ? '同步中' : '同步数据'}</Text>
            </View>
          </View>
        </View>

        <View className='dashboard-section'>
          <Text className='section-title'>👤 个人中心</Text>
          <View className='profile-entry-grid'>
            <View className='profile-entry-item' onClick={handleLogout}>
              <Text className='entry-icon'>🚪</Text>
              <Text className='entry-label'>退出登录</Text>
            </View>
          </View>
        </View>

        <View style={{ height: '120rpx' }} />
      </ScrollView>
    )
  }

  const renderRecipeView = () => (
    <>
      <View className='header'>
        <View className='header-main'>
          {isKitchen && (
            <View className='back-btn' onClick={() => setViewMode('dashboard')}>
              <Text>← 工作台</Text>
            </View>
          )}
          <Text className='title'>{canEditMenu ? '🍳 食谱管理' : '🍳 本周食谱'}</Text>
          <View className='header-actions'>
            <View
              className={`sync-btn ${isSyncing ? 'syncing' : ''}`}
              onClick={!isSyncing ? handleSync : undefined}
            >
              <Text>{isSyncing ? '同步中...' : '🔄 同步'}</Text>
            </View>
            {canEditMenu && currentRecord && viewMode === 'current' && !isEditing && (
              <View className='sync-btn edit-btn' onClick={startEditCurrentDay}>
                <Text>✏️ 编辑</Text>
              </View>
            )}
          </View>
        </View>

        {currentRecord && (
          <View className='header-info'>
            <Text className='campus'>{CAMPUS_CONFIG[currentRecord.grade]?.name || currentRecord.grade}</Text>
            <Text className='week-range'>{currentRecord.weekRange}</Text>
            <Text className='headcount'>{currentRecord.headcount}人用餐</Text>
          </View>
        )}
      </View>

      <View className='view-tabs'>
        <View
          className={`view-tab ${viewMode === 'current' ? 'active' : ''}`}
          onClick={() => setViewMode('current')}
        >
          <Text>📋 本周食谱</Text>
        </View>
        <View
          className={`view-tab ${viewMode === 'history' ? 'active' : ''}`}
          onClick={() => setViewMode('history')}
        >
          <Text>📚 历史食谱 ({history.filter(r => r.status === 'CONFIRMED').length})</Text>
        </View>
      </View>

      {viewMode === 'current' ? (
        <>
          {currentRecord && currentRecord.days && currentRecord.days.length > 0 ? (
            <>
              <View className='day-tabs'>
                {weekdays.map((day, index) => (
                  <View
                    key={day}
                    className={`day-tab ${activeDayIdx === index ? 'active' : ''}`}
                    onClick={() => {
                      setActiveDayIdx(index)
                      setIsEditing(false)
                    }}
                  >
                    <Text className='day-name'>{day}</Text>
                    <Text className='day-date'>{currentRecord.days[index]?.day?.slice(5) || ''}</Text>
                  </View>
                ))}
              </View>

              <ScrollView className='menu-content' scrollY>
                {isEditing && editingDay ? (
                  <View className='edit-panel'>
                    <View className='edit-panel-header'>
                      <Text className='edit-panel-title'>✏️ 编辑食谱</Text>
                      <Text className='edit-panel-day'>{editingDay.day || weekdays[activeDayIdx]}</Text>
                    </View>

                    <View className='edit-group'>
                      <View className='edit-group-title'>
                        <Text className='group-icon'>🍎</Text>
                        <Text className='group-label'>上午</Text>
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>水果加餐</Text>
                        <Input className='edit-input' value={editingDay.meals.morningFruitSnack?.dishName || ''} onInput={e => updateEditingDish('morningFruitSnack.dishName', e.detail.value)} placeholder='请输入水果加餐' />
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>上午点心</Text>
                        <Input className='edit-input' value={editingDay.meals.morningSnack?.dishName || ''} onInput={e => updateEditingDish('morningSnack.dishName', e.detail.value)} placeholder='请输入上午点心' />
                      </View>
                    </View>

                    <View className='edit-group'>
                      <View className='edit-group-title'>
                        <Text className='group-icon'>🍱</Text>
                        <Text className='group-label'>午餐</Text>
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>主菜</Text>
                        <Input className='edit-input' value={editingDay.meals.lunch?.mainDish?.dishName || ''} onInput={e => updateEditingDish('lunch.mainDish.dishName', e.detail.value)} placeholder='请输入主菜' />
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>副菜</Text>
                        <Input className='edit-input' value={editingDay.meals.lunch?.sideDish?.dishName || ''} onInput={e => updateEditingDish('lunch.sideDish.dishName', e.detail.value)} placeholder='请输入副菜' />
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>汤品</Text>
                        <Input className='edit-input' value={editingDay.meals.lunch?.soup?.dishName || ''} onInput={e => updateEditingDish('lunch.soup.dishName', e.detail.value)} placeholder='请输入汤品' />
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>主食</Text>
                        <Input className='edit-input' value={editingDay.meals.lunch?.staple?.dishName || ''} onInput={e => updateEditingDish('lunch.staple.dishName', e.detail.value)} placeholder='请输入主食' />
                      </View>
                    </View>

                    <View className='edit-group'>
                      <View className='edit-group-title'>
                        <Text className='group-icon'>🍪</Text>
                        <Text className='group-label'>下午</Text>
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>牛奶加餐</Text>
                        <Input className='edit-input' value={editingDay.meals.milkSnack?.dishName || ''} onInput={e => updateEditingDish('milkSnack.dishName', e.detail.value)} placeholder='请输入牛奶加餐' />
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>下午点心</Text>
                        <Input className='edit-input' value={editingDay.meals.afternoonSnack?.dishName || ''} onInput={e => updateEditingDish('afternoonSnack.dishName', e.detail.value)} placeholder='请输入下午点心' />
                      </View>
                    </View>

                    <View className='edit-group'>
                      <View className='edit-group-title'>
                        <Text className='group-icon'>🍲</Text>
                        <Text className='group-label'>晚餐</Text>
                      </View>
                      <View className='edit-item'>
                        <Text className='edit-label'>晚餐菜品</Text>
                        <Input className='edit-input' value={editingDay.meals.dinner?.dishName || ''} onInput={e => updateEditingDish('dinner.dishName', e.detail.value)} placeholder='请输入晚餐' />
                      </View>
                    </View>

                    <View className='edit-actions'>
                      <View className='edit-action cancel' onClick={() => { setIsEditing(false); setEditingDay(null) }}>
                        <Text>取消</Text>
                      </View>
                      <View className='edit-action confirm' onClick={saveCurrentDay}>
                        <Text>保存食谱</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    {renderDayMenu(currentRecord.days[activeDayIdx])}

                    {currentRecord.nutritionSummary && (
                      <View className='nutrition-card'>
                        <Text className='nutrition-title'>📊 营养概览</Text>
                        <View className='nutrition-items'>
                          <View className='nutrition-item'>
                            <Text className='value'>{currentRecord.nutritionSummary.avgEnergy}</Text>
                            <Text className='label'>平均能量(kcal)</Text>
                          </View>
                          <View className='nutrition-item'>
                            <Text className='value'>{currentRecord.nutritionSummary.avgProtein}</Text>
                            <Text className='label'>平均蛋白(g)</Text>
                          </View>
                          <View className='nutrition-item'>
                            <Text className='value'>{currentRecord.nutritionSummary.varietyCount}</Text>
                            <Text className='label'>食材种类</Text>
                          </View>
                        </View>
                      </View>
                    )}

                    <View className='nutrition-tips'>
                      <Text className='tips-title'>💡 营养小贴士</Text>
                      <Text className='tips-content'>
                        幼儿每日需要摄入充足的蛋白质、碳水化合物、维生素和矿物质。
                        建议家长在家补充适量水果和奶制品。
                      </Text>
                    </View>
                  </>
                )}

                <View style={{ height: '120rpx' }} />
              </ScrollView>
            </>
          ) : (
            <View className='empty-state'>
              <Text className='empty-icon'>📭</Text>
              <Text className='empty-title'>暂无食谱数据</Text>
              <Text className='empty-hint'>点击右上角"同步"从后端获取数据</Text>

              <View className='sync-btn-big' onClick={handleSync}>
                <Text>🔄 立即同步</Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <ScrollView className='history-list' scrollY>
          {history.filter(r => r.status === 'CONFIRMED').length > 0 ? (
            history.filter(r => r.status === 'CONFIRMED').map(record => (
              <View key={record.id} className='history-card' onClick={() => selectHistoryRecord(record)}>
                <View className='history-header'>
                  <Text className='history-campus'>{CAMPUS_CONFIG[record.grade]?.name || record.grade}</Text>
                  <Text className='history-status'>已确认</Text>
                </View>
                <Text className='history-week'>{record.weekRange}</Text>
                <View className='history-meta'>
                  <Text className='meta-item'>👥 {record.headcount}人</Text>
                  <Text className='meta-item'>📅 {new Date(record.createdAt).toLocaleDateString()}</Text>
                </View>
                {record.nutritionSummary && (
                  <View className='history-nutrition'>
                    <Text>能量 {record.nutritionSummary.avgEnergy}kcal</Text>
                    <Text>蛋白 {record.nutritionSummary.avgProtein}g</Text>
                    <Text>食材 {record.nutritionSummary.varietyCount}种</Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View className='empty-state'>
              <Text className='empty-icon'>📚</Text>
              <Text className='empty-title'>暂无历史食谱</Text>
              <Text className='empty-hint'>食谱在网站确认后会出现在这里</Text>
            </View>
          )}

          <View style={{ height: '120rpx' }} />
        </ScrollView>
      )}
    </>
  )

  if (isLoading) {
    return (
      <View className='loading-page'>
        <Text className='loading-icon'>🍳</Text>
        <Text className='loading-text'>加载中...</Text>
      </View>
    )
  }

  return (
    <View className='kitchen-page'>
      {isKitchen && viewMode === 'dashboard' ? renderDashboard() : renderRecipeView()}
    </View>
  )
}
