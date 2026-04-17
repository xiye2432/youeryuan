export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/index/index',
    'pages/students/index',
    'pages/growth/index',
    'pages/finance/index',
    'pages/profile/index',
    'pages/profile/setup',
    'pages/students/detail',
    'pages/students/attendance',
    'pages/kitchen/index',
    'pages/staff/index',
    'pages/finance/payment',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1e293b',
    navigationBarTitleText: '金星幼儿园',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#f59e0b',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页'
      },
      {
        pagePath: 'pages/students/index',
        text: '学生'
      },
      {
        pagePath: 'pages/growth/index',
        text: '成长'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的'
      }
    ]
  }
})
