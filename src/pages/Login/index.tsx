import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SaaSInput, SaaSButton, pageStyle, containerStyle, SaaSCard, PageTitle } from "../../components/saas";
import { useAppStore } from "../../models/appStore";
import { login } from "../../api/mockApi";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login: doLogin } = useAppStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    if (!username || !password) {
      alert("请输入账号和密码");
      return;
    }
    try {
      const res = await login({ username, password });
      if (res.code === 0) {
        doLogin(res.data.user, res.data.positions, res.data.token);
        alert("登录成功");
        navigate("/");
      }
    } catch {
      alert("账号或密码错误");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: "linear-gradient(135deg, #059669, #34D399)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, boxShadow: "0 14px 30px rgba(5,150,105,0.25)" }}>开</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A" }}>开小灶 PMS</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>食材申购管理系统</div>
          </div>

          <SaaSCard style={{ width: "100%", maxWidth: 360, marginTop: 10 }}>
            <PageTitle title="账号登录" subtitle="请输入账号密码进入系统" />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SaaSInput placeholder="请输入账号" value={username} onChange={setUsername} />
              <SaaSInput placeholder="请输入密码" type="password" value={password} onChange={setPassword} />
              <SaaSButton onClick={handleLogin} block>登录</SaaSButton>
            </div>
          </SaaSCard>

          <div style={{ fontSize: 13, color: "#64748B" }}>
            还没有账号？
            <span onClick={() => navigate("/register")} style={{ color: "#059669", fontWeight: 700, cursor: "pointer", marginLeft: 6 }}>立即注册</span>
          </div>
        </div>
      </div>
    </div>
  );
}
