# Markdown To PDF 示例

这是一份用于验证导出效果的 Markdown 文档，包含标题、正文、表格、任务列表、代码块和复杂数学公式。

## 数学公式

行内公式示例：$E = mc^2$。

块级公式示例：

$$
\begin{aligned}
\nabla \cdot \vec{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \vec{B} &= 0 \\
\nabla \times \vec{E} &= -\frac{\partial \vec{B}}{\partial t}
\end{aligned}
$$

矩阵：

\[
\begin{bmatrix}
1 & 2 & 3 \\
4 & 5 & 6
\end{bmatrix}
\]

$$
\begin{pmatrix}  
  a_{11} & \cdots & a_{1n} \\  
  \vdots & \ddots & \vdots \\  
  a_{m1} & \cdots & a_{mn}  
\end{pmatrix} 
$$

$$
\int x^{\mu}\mathrm{d}x=\frac{x^{\mu +1}}{\mu +1}+C, \left({\mu \neq -1}\right) 
$$

$$
\begin{array}{c} 
  H_{n}=\frac{n}{\sum \limits_{i=1}^{n}\frac{1}{x_{i}}}= \frac{n}{\frac{1}{x_{1}}+ \frac{1}{x_{2}}+ \cdots + \frac{1}{x_{n}}} \\ G_{n}=\sqrt[n]{\prod \limits_{i=1}^{n}x_{i}}= \sqrt[n]{x_{1}x_{2}\cdots x_{n}} \\ A_{n}=\frac{1}{n}\sum \limits_{i=1}^{n}x_{i}=\frac{x_{1}+ x_{2}+ \cdots + x_{n}}{n} \\ Q_{n}=\sqrt{\frac{1}{n}\sum \limits_{i=1}^{n}x_{i}^{2}}= \sqrt{\frac{x_{1}^{2}+ x_{2}^{2}+ \cdots + x_{n}^{2}}{n}} \\ H_{n}\leq G_{n}\leq A_{n}\leq Q_{n}\quad(x_i>0) 
\end{array}
$$

$$
\left.\begin{matrix} 
  a \subset \beta ,b \subset \beta ,a \cap b=P \\  
  a \parallel \alpha ,b \parallel \alpha  
\end{matrix}\right\}\Rightarrow \beta \parallel \alpha 
$$

$$
\begin{array}{l} 
  a\mathop{{x}}\nolimits^{{2}}+bx+c=0 \\ 
  \Delta =\mathop{{b}}\nolimits^{{2}}-4ac \\ 
  \left\{\begin{matrix} 
  \Delta \gt 0\text{方程有两个不相等的实根} \\ 
  \Delta = 0\text{方程有两个相等的实根} \\ 
  \Delta \lt 0\text{方程无实根} 
\end{matrix}\right.    
\end{array} 
$$

测试行内：$
\phi(x,a) = 
\left\{\begin{matrix}
  & x \quad a=0  \\
  & \phi(x,a-1)-\phi(\frac{x}{p_a},a-1)\quad a\not=0
\end{matrix}\right.
$ 测试。

## 代码块

```ts
export function square(value: number): number {
  return value * value;
}
```

## 表格

| 功能 | 状态 | 备注 |
| --- | --- | --- |
| Markdown 渲染 | 完成 | 支持 GFM |
| 数学公式 | 完成 | 使用 MathJax |
| 代码高亮 | 完成 | 使用 Shiki |

## 任务列表

- [x] 支持命令面板导出
- [x] 支持右键导出
- [ ] 后续增加实时预览

## 其他

- a
  - a.b ~~删除~~ <u>下划线</u>
- b
- c
  - c.b **加粗** *斜体* $f(x) = x^n_0$ ***粗斜体***

1. a
2. b
3. c
