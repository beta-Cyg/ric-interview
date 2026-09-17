import { Button, ConfigProvider, Drawer, Layout, Menu, Typography } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { useState } from 'react';
import zhCN from 'antd/locale/zh_CN';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import AssistantPage from './pages/AssistantPage';
import CartPage from './pages/CartPage';
import CourseDetailPage from './pages/CourseDetailPage';
import CourseListPage from './pages/CourseListPage';
import { CartProvider, useCart } from './store/cart';

const { Header, Content } = Layout;

function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { count } = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = [
    { key: '/', label: '课程列表' },
    {
      key: '/cart',
      label: <span>选课篮{count > 0 ? `（${count}）` : ''}</span>,
    },
    { key: '/assistant', label: 'AI 选课助手' },
  ];

  // 详情页属于「课程列表」这一支，保持高亮
  const activeKey = location.pathname.startsWith('/course') ? '/' : location.pathname;

  const go = (key: string) => {
    setDrawerOpen(false);
    navigate(key);
  };

  return (
    <Header className="app-header">
      <img className="app-logo" src="/ric-logo-invert.png" alt="RIC" />
      <Typography.Text className="app-brand" strong>
        RIC 选课规划器
      </Typography.Text>
      <Button
        type="text"
        aria-label="菜单"
        icon={<MenuOutlined />}
        className="app-menu-toggle"
        onClick={() => setDrawerOpen(true)}
      />
      <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={[activeKey]}
        items={items}
        onClick={({ key }) => navigate(key)}
        className="app-menu"
        style={{ background: 'transparent' }}
      />
      <Drawer
        title="菜单"
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
        className="app-drawer"
      >
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[activeKey]}
          items={items}
          onClick={({ key }) => go(key)}
        />
      </Drawer>
    </Header>
  );
}

function Shell() {
  return (
    <Layout className="app-layout">
      <Navigation />
      <Content className="app-content">
        <Routes>
          <Route path="/" element={<CourseListPage />} />
          <Route path="/course/:code" element={<CourseDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1f1f1f',
          colorLink: '#1f1f1f',
          borderRadius: 8,
          fontFamily:
            "'JetBrains Mono', 'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Heiti SC', sans-serif",
        },
      }}
    >
      <CartProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </CartProvider>
    </ConfigProvider>
  );
}
