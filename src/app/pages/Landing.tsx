import { useNavigate } from 'react-router';
import { Check, Car, Users, MapPin, FileText, TrendingUp, Zap, Shield, Clock, ArrowRight, MessageCircle, CheckCircle, DollarSign, Building2, PhoneCall, Mail, ChevronDown, BarChart3, Package, Wrench } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useState } from 'react';

export function Landing() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800">
      <Header />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Gestiona tu compraventa de coches como un profesional
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            Stock, operaciones, clientes, documentos y finanzas. Todo en una plataforma diseñada para compraventas.
          </p>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Desde la entrada del vehículo hasta la entrega al cliente. Sin caos, sin papeles perdidos.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button 
              onClick={() => navigate('/auth/entry')}
              className="px-8 py-4 bg-[#0f1419] text-white rounded-lg hover:bg-[#1a1f26] transition-colors font-medium flex items-center gap-2"
            >
              Probar gratis 14 días
              <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                const contactSection = document.getElementById('contacto');
                contactSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-4 border border-gray-900 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
            >
              Hablar con ventas
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <span>Sin tarjeta</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <span>14 días gratis</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <span>Sin permanencia</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <span>Soporte en español</span>
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
            ✓ Compatible con ANCOVE · ✓ Cumple normativa española · ✓ Datos en Europa
          </p>
        </div>
      </section>

      {/* Modules Section */}
      <section id="modulos" className="py-20 px-6 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Todo lo que necesitas para gestionar tu compraventa
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              8 módulos especializados que trabajan juntos para simplificar tu día a día
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Module 1 - Vehicles */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                <Car className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Stock de Vehículos</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Control total de tu inventario con visibilidad en tiempo real
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Ficha completa de cada vehículo</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Fotos, documentos y estado</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Días en stock y alertas</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Cálculo automático de márgenes</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Importación masiva CSV</span>
                </li>
              </ul>
            </div>

            {/* Module 2 - Operations */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-amber-600 rounded-lg flex items-center justify-center mb-4">
                <Package className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Operaciones</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Gestiona compras y ventas de principio a fin
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Pipeline de ventas visual</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Gestión de tareas y recordatorios</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Control de gastos por operación</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Incidencias y seguimiento</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Historial completo de acciones</span>
                </li>
              </ul>
            </div>

            {/* Module 3 - CRM */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">CRM • Clientes</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                No pierdas ningún lead y convierte más ventas
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Registro automático de leads</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Seguimiento de interacciones</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Gestión de consentimientos RGPD</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Historial de compras</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Asignación de responsables</span>
                </li>
              </ul>
            </div>

            {/* Module 4 - Documents */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Documentos</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Genera contratos y gestiona documentación legal
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Plantillas personalizables</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Firma digital integrada</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Envío automático a gestoría</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Repositorio centralizado</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Control de versiones</span>
                </li>
              </ul>
            </div>

            {/* Module 5 - Locations */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Ubicaciones</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Controla dónde está cada vehículo en tiempo real
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Mapa visual del aparcamiento</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Gestión de zonas y plazas</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Movimientos entre ubicaciones</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Alertas de capacidad</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Historial de movimientos</span>
                </li>
              </ul>
            </div>

            {/* Module 6 - Finance */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-emerald-600 rounded-lg flex items-center justify-center mb-4">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Finanzas</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Conoce tus números y toma mejores decisiones
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Dashboard financiero en tiempo real</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Análisis de márgenes por vehículo</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Control de gastos operativos</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Ingresos vs gastos mensuales</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Exportación para contabilidad</span>
                </li>
              </ul>
            </div>

            {/* Module 7 - Team */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Equipo</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Gestiona usuarios, roles y permisos
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Usuarios ilimitados</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Roles y permisos personalizables</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Registro de actividad por usuario</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Asignación de tareas</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Estadísticas de rendimiento</span>
                </li>
              </ul>
            </div>

            {/* Module 8 - Integrations */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Integraciones</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                Conecta con herramientas que ya usas
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Integración ANCOVE oficial</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>API REST completa</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Webhooks para automatizaciones</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Exportación de datos</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Conexión con gestorías</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-20 px-6 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Cómo funciona Udar Edge
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Desde la entrada del vehículo hasta la entrega al cliente
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">
                  1
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Registra el vehículo</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Da de alta el vehículo con todos sus datos: matrícula, marca, modelo, fotos, documentación y coste de compra. Asígnale una ubicación en tu aparcamiento.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">Ficha técnica</span>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">Fotos</span>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">Ubicación</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-amber-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">
                  2
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Gestiona la venta</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Registra leads, crea operaciones de venta, gestiona reservas, genera documentos automáticamente y firma digitalmente. Todo el proceso en un solo lugar.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm">Pipeline</span>
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm">Contratos</span>
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm">Firma digital</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">
                  3
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Analiza y optimiza</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Consulta tus KPIs en tiempo real: días de rotación, márgenes por vehículo, vehículos en stock, ingresos mensuales. Toma decisiones basadas en datos.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">KPIs</span>
                  <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">Márgenes</span>
                  <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">Reportes</span>
                </div>
              </div>
            </div>
          </div>

          {/* Benefits Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-16">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
              <Clock className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Ahorra tiempo</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Automatiza tareas repetitivas y dedica tiempo a vender</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <Shield className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Cumple la ley</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Gestión RGPD y documentación legal siempre en orden</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 text-center">
              <TrendingUp className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Aumenta ventas</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">No pierdas ningún lead y convierte más con el CRM</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <BarChart3 className="w-8 h-8 text-amber-600 mx-auto mb-3" />
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Controla finanzas</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Conoce tus márgenes reales y mejora rentabilidad</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planes" className="py-20 px-6 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Planes adaptados a tu compraventa
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Sin permanencia. Cancela cuando quieras. Cambia de plan sin penalización.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            {/* Plan Starter */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Starter</h3>
                <p className="text-gray-600 dark:text-gray-400">Para compraventas que empiezan a digitalizarse</p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-gray-900 dark:text-gray-100">€79</span>
                  <span className="text-gray-600 dark:text-gray-400">/mes</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Facturación mensual</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Hasta 50 vehículos en stock</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">2 usuarios incluidos</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Gestión de stock básica</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">CRM y leads</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Documentos básicos</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">1 ubicación</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Soporte por email</span>
                </li>
              </ul>
              <button 
                onClick={() => navigate('/auth/entry')}
                className="w-full px-6 py-3 border-2 border-gray-900 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
              >
                Empezar gratis
              </button>
            </div>

            {/* Plan Professional - Recommended */}
            <div className="bg-white dark:bg-gray-800 border-2 border-amber-500 rounded-2xl p-8 relative shadow-xl scale-105">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-amber-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Más popular
                </span>
              </div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Professional</h3>
                <p className="text-gray-600 dark:text-gray-400">Para compraventas en crecimiento</p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-gray-900 dark:text-gray-100">€149</span>
                  <span className="text-gray-600 dark:text-gray-400">/mes</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Facturación mensual</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300"><strong>Vehículos ilimitados</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">5 usuarios incluidos</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300"><strong>Todos los módulos</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Pipeline de ventas avanzado</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Firma digital ilimitada</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Plantillas personalizadas</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Analytics y reportes</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Integración ANCOVE</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Soporte prioritario</span>
                </li>
              </ul>
              <button 
                onClick={() => navigate('/auth/entry')}
                className="w-full px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
              >
                Empezar gratis
              </button>
            </div>

            {/* Plan Enterprise */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-8">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Enterprise</h3>
                <p className="text-gray-600 dark:text-gray-400">Para grupos con múltiples ubicaciones</p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-gray-900 dark:text-gray-100">€349</span>
                  <span className="text-gray-600 dark:text-gray-400">/mes</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Por ubicación · Facturación mensual</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300"><strong>Todo de Professional</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Múltiples ubicaciones</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Usuarios ilimitados</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Transferencias entre sedes</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Consolidación de finanzas</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">API y webhooks completos</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Onboarding personalizado</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Soporte telefónico 24/7</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">Account manager dedicado</span>
                </li>
              </ul>
              <button 
                onClick={() => {
                  const contactSection = document.getElementById('contacto');
                  contactSection?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full px-6 py-3 border-2 border-gray-900 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
              >
                Contactar ventas
              </button>
            </div>
          </div>

          {/* Pricing Notes */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Información sobre planes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">14 días de prueba gratis</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Prueba todas las funcionalidades sin tarjeta de crédito. Decide después.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin permanencia</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Cancela en cualquier momento. No te pedimos compromiso de tiempo.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Cambia de plan sin penalización</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Sube o baja de plan cuando lo necesites. Ajustamos el precio proporcionalmente.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Usuarios adicionales: €15/mes</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Si necesitas más usuarios, añádelos por solo €15/mes cada uno.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-6 bg-white dark:bg-gray-800">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Preguntas frecuentes
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Resolvemos las dudas más comunes sobre Udar Edge
            </p>
          </div>

          <div className="space-y-4">
            {/* FAQ 1 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(0)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Necesito conocimientos técnicos para usar Udar Edge?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 0 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 0 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  No, Udar Edge está diseñado para ser intuitivo. Si sabes usar WhatsApp o Instagram, sabes usar Udar Edge. Además, te acompañamos en el proceso de onboarding para que empieces sin problemas.
                </div>
              )}
            </div>

            {/* FAQ 2 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(1)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Puedo importar mi stock actual de vehículos?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 1 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 1 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Sí, puedes importar tu stock completo mediante un archivo CSV o Excel. Te proporcionamos plantillas para que sea muy sencillo. También podemos ayudarte en el proceso si lo necesitas.
                </div>
              )}
            </div>

            {/* FAQ 3 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(2)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Dónde se almacenan mis datos?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 2 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 2 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Todos los datos se almacenan en servidores seguros en la Unión Europea, cumpliendo con el RGPD. Realizamos copias de seguridad diarias y tus datos están encriptados tanto en tránsito como en reposo.
                </div>
              )}
            </div>

            {/* FAQ 4 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(3)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿La firma digital es válida legalmente en España?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 3 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 3 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Sí, utilizamos firma digital cualificada que cumple con el Reglamento eIDAS de la Unión Europea. Tiene la misma validez legal que una firma manuscrita para contratos de compraventa de vehículos.
                </div>
              )}
            </div>

            {/* FAQ 5 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(4)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Qué incluye la integración con ANCOVE?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 4 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 4 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  La integración oficial con ANCOVE te permite validar tu estado de socio, acceder a servicios exclusivos y sincronizar información de forma automática. Es completamente opcional y solo disponible para socios ANCOVE.
                </div>
              )}
            </div>

            {/* FAQ 6 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(5)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Puedo personalizar las plantillas de documentos?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 5 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 5 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Sí, puedes personalizar completamente las plantillas de contratos, hojas de entrega y facturas con tu logo, textos y cláusulas específicas. Incluimos variables que se rellenan automáticamente con los datos del vehículo y cliente.
                </div>
              )}
            </div>

            {/* FAQ 7 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(6)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Qué pasa si tengo múltiples ubicaciones?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 6 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 6 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Con el plan Enterprise puedes gestionar múltiples ubicaciones desde una sola cuenta. Cada ubicación tiene su propio stock, equipo y finanzas, pero puedes consolidar reportes y transferir vehículos entre sedes.
                </div>
              )}
            </div>

            {/* FAQ 8 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(7)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Ofrecéis soporte técnico en español?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 7 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 7 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Sí, todo nuestro soporte es en español. Disponemos de chat en vivo, email y para clientes Enterprise, soporte telefónico. Los tiempos de respuesta son: email en 24h laborables, chat en menos de 2h en horario de oficina.
                </div>
              )}
            </div>

            {/* FAQ 9 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(8)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Puedo cancelar en cualquier momento?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 8 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 8 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Sí, puedes cancelar tu suscripción en cualquier momento desde la configuración de tu cuenta. No hay penalizaciones ni cargos extra. Mantendrás acceso hasta el final de tu período de facturación actual.
                </div>
              )}
            </div>

            {/* FAQ 10 */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
              <button
                onClick={() => toggleFaq(9)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">¿Puedo exportar mis datos si decido dejar Udar Edge?</span>
                <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${openFaq === 9 ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === 9 && (
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-400">
                  Por supuesto. Tus datos son tuyos. Puedes exportar toda tu información (vehículos, clientes, documentos, operaciones) en formatos estándar (CSV, Excel, PDF) en cualquier momento.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contacto" className="py-20 px-6 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              ¿Tienes dudas? Hablemos
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Estamos aquí para ayudarte a elegir la mejor solución para tu compraventa
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8">
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Envíanos un mensaje</h3>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                alert('Formulario enviado:\n\nGracias por tu interés en Udar Edge. Nos pondremos en contacto contigo en menos de 24 horas laborables.\n\nEsta funcionalidad enviaría el mensaje a nuestro equipo de ventas.');
              }}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre completo *</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Juan García"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                  <input 
                    type="email" 
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="juan@compraventa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teléfono</label>
                  <input 
                    type="tel" 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="+34 600 000 000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de tu compraventa</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Coches García"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">¿Cuántos vehículos gestionas al mes?</label>
                  <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent">
                    <option>Menos de 10</option>
                    <option>10-30</option>
                    <option>30-50</option>
                    <option>50-100</option>
                    <option>Más de 100</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mensaje</label>
                  <textarea 
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Cuéntanos qué necesitas..."
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full px-6 py-4 bg-[#0f1419] text-white rounded-lg hover:bg-[#1a1f26] transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  Enviar mensaje
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Te responderemos en menos de 24 horas laborables
                </p>
              </form>
            </div>

            {/* Contact Info */}
            <div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 mb-6">
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Otras formas de contacto</h3>
                
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Email</h4>
                      <p className="text-gray-600 dark:text-gray-400">ventas@udaredge.com</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Respuesta en menos de 24h</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <PhoneCall className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Teléfono</h4>
                      <p className="text-gray-600 dark:text-gray-400">+34 900 123 456</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Lun-Vie: 9:00-18:00</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Chat en vivo</h4>
                      <p className="text-gray-600 dark:text-gray-400">Disponible en la plataforma</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Respuesta inmediata en horario de oficina</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Demo CTA */}
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-8 text-white">
                <h3 className="text-2xl font-bold mb-3">¿Prefieres ver una demo?</h3>
                <p className="mb-6 text-amber-50">
                  Agenda una videollamada de 30 minutos y te mostramos Udar Edge en acción, adaptado a tu caso concreto.
                </p>
                <button 
                  onClick={() => alert('Agendar demo:\nEsta funcionalidad abriría un calendario para elegir día y hora para una demo personalizada por videollamada')}
                  className="w-full px-6 py-3 bg-white dark:bg-gray-800 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors font-medium"
                >
                  Agendar demo gratuita
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-[#0f1419] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">
            Empieza a gestionar tu compraventa de forma profesional
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            14 días de prueba gratis. Sin tarjeta. Sin permanencia. Empieza hoy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => navigate('/auth/entry')}
              className="px-8 py-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium flex items-center gap-2"
            >
              Crear cuenta gratis
              <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                const contactSection = document.getElementById('contacto');
                contactSection?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-8 py-4 border-2 border-white text-white rounded-lg hover:bg-white hover:text-gray-900 transition-colors font-medium"
            >
              Hablar con ventas
            </button>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-6">
            ✓ Configuración en menos de 5 minutos · ✓ Importa tu stock actual · ✓ Soporte en español
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
